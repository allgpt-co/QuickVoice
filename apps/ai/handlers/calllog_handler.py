import asyncio
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from handlers.post_call_metadata import build_transcript_extracted_data, merge_transcript_metadata
from utils.logger import logger, redact_sensitive
from utils.metrics import emit_metric

QUEUE_DIR_ENV = "AI_CALL_LOG_QUEUE_DIR"
DEFAULT_QUEUE_DIR = "/var/lib/quickvoice/call-logs"
DEAD_LETTER_DIR_NAME = "dead-letter"
DEFAULT_QUEUE_POLL_SECONDS = 5.0
MAX_QUEUE_RETRY_BACKOFF_SECONDS = 300.0
QUEUE_CLAIM_STALE_SECONDS = 300.0

def build_call_log_payload(
    *,
    config: dict[str, Any],
    call_context: dict[str, Any],
    started_at: datetime,
    ended_at: datetime,
    recording_path: str | None,
    transcripts: list[dict[str, Any]],
    status: str = "COMPLETED",
) -> dict[str, Any]:
    metadata = _build_metadata(call_context, transcripts)
    return {
        "organizationId": _required(config, "organization_id"),
        "userId": config.get("user_id"),
        "agentId": _required(config, "agent_id"),
        "callId": _required(call_context, "call_id"),
        "startTime": _isoformat(started_at),
        "endTime": _isoformat(ended_at),
        "direction": call_context.get("direction", "inbound"),
        "durationSeconds": max(0, int((ended_at - started_at).total_seconds())),
        "status": status,
        "metadata": metadata,
        "recordingSid": recording_path or "",
        "transcripts": [_normalize_transcript_item(item, index) for index, item in enumerate(transcripts)],
        "toNumber": _optional_string(call_context, "to_number"),
        "fromNumber": _optional_string(call_context, "from_number"),
        "provider": call_context.get("provider") or config.get("provider") or "WEB_WIDGET",
        "extractedData": build_transcript_extracted_data(config, transcripts, metadata),
        "evaluatedData": _as_list(config.get("data_evaluated")),
    }


async def post_call_log(
    payload: dict[str, Any],
    *,
    server_api_url: str | None = None,
    internal_api_key: str | None = None,
    post_json=None,
):
    base_url = _api_base_url(server_api_url or os.getenv("SERVER_API_URL") or "")
    api_key = internal_api_key or os.getenv("INTERNAL_API_KEY")
    if not base_url:
        raise RuntimeError("SERVER_API_URL is required to post call logs")
    if not api_key:
        raise RuntimeError("INTERNAL_API_KEY is required to post call logs")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Idempotency-Key": _call_log_idempotency_key(payload),
        "x-organization-id": _required(payload, "organizationId"),
    }
    user_id = payload.get("userId")
    if user_id:
        headers["x-user-id"] = user_id

    return await (post_json or _post_json)(f"{base_url}/calls", headers, payload)


async def post_call_log_with_retry(
    payload: dict[str, Any],
    *,
    attempts: int = 3,
    backoff_seconds: float = 0.25,
    queue_dir: str | Path | None = None,
    server_api_url: str | None = None,
    internal_api_key: str | None = None,
    post_json=None,
):
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return await post_call_log(
                payload,
                server_api_url=server_api_url,
                internal_api_key=internal_api_key,
                post_json=post_json,
            )
        except Exception as error:
            last_error = error
            if attempt < attempts - 1:
                await asyncio.sleep(backoff_seconds * (2**attempt))

    queued_path = enqueue_call_log(payload, queue_dir=queue_dir)
    emit_metric("call_log_delivery", status="queued", call_id=payload.get("callId"))
    raise RuntimeError(f"call log delivery failed; queued at {queued_path}") from last_error


def enqueue_call_log(payload: dict[str, Any], *, queue_dir: str | Path | None = None) -> Path:
    directory = _queue_dir(queue_dir)
    directory.mkdir(parents=True, exist_ok=True)
    call_id = _required(payload, "callId")
    digest = hashlib.sha256(call_id.encode("utf-8")).hexdigest()[:16]
    path = directory / f"{_safe_filename(call_id)}-{digest}.json"
    _atomic_write_json(path, {"attempts": 0, "payload": payload})
    return path


async def flush_call_log_queue(
    *,
    queue_dir: str | Path | None = None,
    server_api_url: str | None = None,
    internal_api_key: str | None = None,
    post_json=None,
) -> dict[str, int]:
    directory = _queue_dir(queue_dir)
    if not directory.exists():
        return {"posted": 0, "failed": 0, "dead_lettered": 0}

    _reclaim_stale_queue_claims(directory)

    posted = 0
    failed = 0
    dead_lettered = 0
    for path in sorted(directory.glob("*.json")):
        claimed_path = path.with_name(f"{path.name}.processing")
        try:
            path.rename(claimed_path)
        except FileNotFoundError:
            continue
        except OSError:
            failed += 1
            continue

        envelope: dict[str, Any] = {}
        try:
            envelope = json.loads(claimed_path.read_text(encoding="utf-8"))
            next_attempt_at = float(envelope.get("nextAttemptAtEpoch", 0) or 0)
            if next_attempt_at > time.time():
                claimed_path.rename(path)
                continue
            payload = envelope.get("payload", envelope)
            if not isinstance(payload, dict):
                raise ValueError("queued call log has no payload")
            _required(payload, "callId")
            _required(payload, "organizationId")
        except Exception:
            dead_letter_dir = directory / DEAD_LETTER_DIR_NAME
            dead_letter_dir.mkdir(parents=True, exist_ok=True)
            claimed_path.replace(dead_letter_dir / path.name)
            dead_lettered += 1
            continue

        try:
            await post_call_log(
                payload,
                server_api_url=server_api_url,
                internal_api_key=internal_api_key,
                post_json=post_json,
            )
            claimed_path.unlink(missing_ok=True)
            posted += 1
            emit_metric("call_log_queue", status="posted", call_id=payload.get("callId"))
        except Exception as error:
            failed += 1
            attempts = int(envelope.get("attempts", 0)) + 1
            retry_delay = min(
                MAX_QUEUE_RETRY_BACKOFF_SECONDS,
                max(1.0, 2 ** min(attempts - 1, 10)),
            )
            _atomic_write_json(
                path,
                {
                    "attempts": attempts,
                    "nextAttemptAtEpoch": time.time() + retry_delay,
                    "lastError": redact_sensitive(str(error))[:500],
                    "payload": payload,
                },
            )
            claimed_path.unlink(missing_ok=True)

    return {"posted": posted, "failed": failed, "dead_lettered": dead_lettered}


async def run_call_log_queue_consumer(
    *,
    queue_dir: str | Path | None = None,
    server_api_url: str | None = None,
    internal_api_key: str | None = None,
    post_json=None,
    poll_seconds: float = DEFAULT_QUEUE_POLL_SECONDS,
    stop_event: asyncio.Event | None = None,
) -> None:
    interval = max(0.05, float(poll_seconds))
    while stop_event is None or not stop_event.is_set():
        try:
            result = await flush_call_log_queue(
                queue_dir=queue_dir,
                server_api_url=server_api_url,
                internal_api_key=internal_api_key,
                post_json=post_json,
            )
            if result["failed"] or result["dead_lettered"]:
                logger.error(
                    "[CALL_LOG] durable queue drain requires attention: {}",
                    redact_sensitive(result),
                )
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.error(
                "[CALL_LOG] durable queue consumer failed: {}",
                redact_sensitive(str(error)),
            )

        if stop_event is None:
            await asyncio.sleep(interval)
            continue
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except TimeoutError:
            pass


def _api_base_url(server_api_url: str) -> str:
    base_url = server_api_url.rstrip("/")
    if not base_url:
        return ""
    return base_url if base_url.endswith("/api/v1") else f"{base_url}/api/v1"


def _build_metadata(call_context: dict[str, Any], transcripts: list[dict[str, Any]]) -> dict[str, Any]:
    metadata = dict(call_context.get("metadata")) if isinstance(call_context.get("metadata"), dict) else {}
    if call_context.get("summary") not in (None, ""):
        metadata["summary"] = call_context.get("summary")
    else:
        metadata.setdefault("summary", "")
    if call_context.get("intent") not in (None, ""):
        metadata["intent"] = call_context.get("intent")
    else:
        metadata.setdefault("intent", "")
    if call_context.get("outbound_id") not in (None, "") or "outboundId" not in metadata:
        metadata["outboundId"] = call_context.get("outbound_id")
    return merge_transcript_metadata(metadata, transcripts)


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _normalize_transcript_item(item: dict[str, Any], index: int) -> dict[str, str]:
    role = item.get("role")
    if role == "assistant":
        role = "agent"
    if role not in ("user", "agent"):
        role = "agent"

    content = item.get("message", item.get("content", ""))
    if isinstance(content, list):
        content = " ".join(str(part) for part in content)

    return {
        "messageId": str(item.get("messageId") or item.get("id") or f"msg-{index}"),
        "role": role,
        "message": str(content),
        "timestamp": _isoformat(item.get("timestamp") or item.get("time") or datetime.now(timezone.utc)),
    }


def _required(source: dict[str, Any], key: str) -> str:
    value = source.get(key)
    if value is None or value == "":
        raise ValueError(f"{key} is required")
    return str(value)


def _optional_string(source: dict[str, Any], key: str) -> str:
    value = source.get(key)
    if value is None:
        return ""
    return str(value)


def _isoformat(value: Any) -> str:
    if isinstance(value, str):
        if value.endswith("+00:00"):
            return f"{value[:-6]}Z"
        return value

    if isinstance(value, (int, float)):
        dt = datetime.fromtimestamp(float(value), tz=timezone.utc)
    elif isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.now(timezone.utc)

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return f"{dt.isoformat(timespec='seconds')}Z"


async def _post_json(url: str, headers: dict[str, str], body: dict[str, Any]):
    return await asyncio.to_thread(_blocking_post_json, url, headers, body)


def _blocking_post_json(url: str, headers: dict[str, str], body: dict[str, Any]):
    request = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        payload = response.read().decode("utf-8")
    return json.loads(payload)


def _queue_dir(queue_dir: str | Path | None = None) -> Path:
    return Path(queue_dir or os.getenv(QUEUE_DIR_ENV) or DEFAULT_QUEUE_DIR)


def _safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-") or "call"


def _call_log_idempotency_key(payload: dict[str, Any]) -> str:
    digest = hashlib.sha256(_required(payload, "callId").encode("utf-8")).hexdigest()
    return f"quickvoice-calllog-{digest}"


def _reclaim_stale_queue_claims(directory: Path) -> None:
    stale_before = time.time() - QUEUE_CLAIM_STALE_SECONDS
    for claimed_path in directory.glob("*.json.processing"):
        try:
            if claimed_path.stat().st_mtime > stale_before:
                continue
            original_path = claimed_path.with_name(
                claimed_path.name.removesuffix(".processing")
            )
            claimed_path.replace(original_path)
        except FileNotFoundError:
            continue


def _atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    temporary_path = path.with_name(
        f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp"
    )
    try:
        with temporary_path.open("w", encoding="utf-8") as handle:
            json.dump(value, handle, allow_nan=False, sort_keys=True, separators=(",", ":"))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)
