"""Durable, best-effort delivery of configured post-call webhooks."""

import asyncio
import hashlib
import json
import os
import time
from pathlib import Path
from urllib.request import Request

from handlers.calllog_handler import _reclaim_stale_queue_claims
from handlers.config_handler import get_config
from handlers.livekit_handler import get_recording_storage_config
from handlers.webhook_fields import webhook_header_values
from handlers.webhook_events import report_webhook_event, webhook_error_code
from utils.logger import logger, redact_sensitive
from utils.safe_http import safe_https_request

QUEUE_DIR_ENV = "AI_POST_CALL_WEBHOOK_QUEUE_DIR"
DEFAULT_QUEUE_DIR = "/var/lib/quickvoice/post-call-webhooks"
MAX_ATTEMPTS = 10


def enqueue_post_call_webhook(payload: dict, *, queue_dir: str | Path | None = None) -> Path:
    if payload.get("metadata", {}).get("zeroPiiRetention"):
        payload = {**payload, "fromNumber": "", "toNumber": "", "metadata": {"zeroPiiRetention": True}}
    directory = Path(queue_dir or os.getenv(QUEUE_DIR_ENV) or DEFAULT_QUEUE_DIR)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(directory, 0o700)
    call_id = str(payload["callId"])
    digest = hashlib.sha256(call_id.encode()).hexdigest()
    path = directory / f"{digest}.json"
    if path.exists():
        return path
    _atomic_write(path, {"payload": payload, "attempts": 0})
    return path


def _atomic_write(path: Path, value: dict) -> None:
    directory = path.parent
    digest = path.stem
    temporary = directory / f".{digest}.{os.getpid()}.{time.time_ns()}.tmp"
    try:
        with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as handle:
            json.dump(value, handle, allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def post_call_webhook_body(payload: dict, webhook: dict, audio_url: str | None = None) -> dict:
    zero_pii_retention = bool(payload.get("metadata", {}).get("zeroPiiRetention"))
    body = {
        key: payload.get(key)
        for key in (
            "organizationId", "agentId", "callId", "startTime", "endTime",
            "direction", "durationSeconds", "status", "fromNumber", "toNumber",
            "provider",
        )
    }
    if zero_pii_retention:
        for key in ("fromNumber", "toNumber"):
            body.pop(key, None)
    if webhook.get("transcript") and not zero_pii_retention:
        body["transcript"] = payload.get("transcripts", [])
    if webhook.get("audio_url") and audio_url and not zero_pii_retention:
        body["audioUrl"] = audio_url
    return body


def signed_recording_url(recording_path: str) -> str:
    from botocore.config import Config
    from botocore.session import get_session

    storage = get_recording_storage_config()
    client = get_session().create_client(
        "s3",
        region_name=storage["region"],
        config=Config(signature_version="s3v4", connect_timeout=2, read_timeout=3,
                      retries={"max_attempts": 1}),
        **({"aws_access_key_id": storage["access_key"], "aws_secret_access_key": storage["secret"]}
           if storage.get("access_key") else {}),
        **({"aws_session_token": storage["session_token"]}
           if storage.get("session_token") else {}),
    )
    try:
        client.head_object(Bucket=storage["bucket"], Key=recording_path)
        return client.generate_presigned_url(
            "get_object", Params={"Bucket": storage["bucket"], "Key": recording_path}, ExpiresIn=3600,
        )
    finally:
        client.close()


def _send(payload: dict, webhook: dict) -> None:
    audio_url = None
    if webhook.get("audio_url") and payload.get("recordingSid") and not payload.get("metadata", {}).get("zeroPiiRetention"):
        audio_url = signed_recording_url(payload["recordingSid"])
    headers = {key: value for key, value in webhook_header_values(webhook.get("headers")).items()
               if key.lower() not in {"content-type", "idempotency-key"}}
    headers.update({"Content-Type": "application/json", "Idempotency-Key": f"quickvoice-post-call-{payload['callId']}"})
    safe_https_request(
        Request(
            webhook["webhook_url"],
            data=json.dumps(post_call_webhook_body(payload, webhook, audio_url)).encode(),
            headers=headers,
            method="POST",
        ),
        timeout=5,
        max_response_bytes=16_384,
        read_response_body=False,
    )


async def flush_post_call_webhook_queue(*, queue_dir: str | Path | None = None,
                                       load_config=get_config, send=_send) -> dict[str, int]:
    directory = Path(queue_dir or os.getenv(QUEUE_DIR_ENV) or DEFAULT_QUEUE_DIR)
    if not directory.exists():
        return {"sent": 0, "failed": 0}
    _reclaim_stale_queue_claims(directory)
    sent = failed = 0
    # ponytail: this linear scan is fine for current call volume; use a Redis queue
    # if a worker regularly holds more than 100k pending webhooks.
    for path in sorted(directory.glob("*.json")):
        claimed = path.with_name(f"{path.name}.processing")
        try:
            path.rename(claimed)
        except (FileNotFoundError, OSError):
            continue
        envelope = None
        try:
            envelope = json.loads(claimed.read_text())
            if envelope.get("nextAttemptAtEpoch", 0) > time.time():
                claimed.rename(path)
                continue
            payload = envelope["payload"]
            config = await load_config(payload["agentId"])
            if config.get("organization_id") != payload["organizationId"]:
                raise ValueError("Webhook organization does not match the call")
            webhook = config.get("post_call_webhook")
            if not isinstance(webhook, dict) or not webhook.get("webhook_url"):
                claimed.unlink(missing_ok=True)
                continue
            if payload.get("_webhookDestinationHash") != hashlib.sha256(
                str(webhook["webhook_url"]).encode()
            ).hexdigest():
                raise ValueError("Post-call webhook destination changed after the call")
            await asyncio.to_thread(send, payload, webhook)
            claimed.unlink(missing_ok=True)
            sent += 1
            await report_webhook_event(config, "post_call", "delivered")
            logger.info("[webhook:post-call] delivered call {}", redact_sensitive(payload["callId"]))
        except Exception as error:
            failed += 1
            logger.warning("[webhook:post-call] delivery failed: {}", redact_sensitive(str(error)))
            attempts = int(envelope.get("attempts", 0)) + 1 if isinstance(envelope, dict) else MAX_ATTEMPTS
            if (attempts == 1 or attempts >= MAX_ATTEMPTS) and isinstance(envelope, dict) and isinstance(envelope.get("payload"), dict):
                await report_webhook_event(
                    {"agent_id": envelope["payload"].get("agentId"),
                     "organization_id": envelope["payload"].get("organizationId")},
                    "post_call", "failed" if attempts >= MAX_ATTEMPTS else "retrying",
                    webhook_error_code(error),
                )
            if attempts >= MAX_ATTEMPTS:
                dead_letter = directory / "dead-letter"
                dead_letter.mkdir(mode=0o700, exist_ok=True)
                claimed.replace(dead_letter / path.name)
            else:
                envelope["attempts"] = attempts
                envelope["nextAttemptAtEpoch"] = time.time() + min(300, 2 ** attempts)
                _atomic_write(path, envelope)
                claimed.unlink(missing_ok=True)
    return {"sent": sent, "failed": failed}


async def run_post_call_webhook_queue_consumer(*, queue_dir: str | Path | None = None,
                                               poll_seconds: float = 5.0,
                                               stop_event: asyncio.Event | None = None) -> None:
    while stop_event is None or not stop_event.is_set():
        try:
            await flush_post_call_webhook_queue(queue_dir=queue_dir)
        except Exception as error:
            logger.error("[webhook:post-call] outbox error: {}", redact_sensitive(str(error)))
        await asyncio.sleep(max(0.1, poll_seconds))
