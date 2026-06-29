import asyncio
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from utils.metrics import emit_metric

QUEUE_DIR_ENV = "AI_CALL_LOG_QUEUE_DIR"
DEFAULT_QUEUE_DIR = "/tmp/quickvoice-ai-calllogs"
DEAD_LETTER_DIR_NAME = "dead-letter"
MAX_QUEUE_ATTEMPTS = 5

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
    metadata = {
        "summary": call_context.get("summary", ""),
        "intent": call_context.get("intent", ""),
        "outboundId": call_context.get("outbound_id"),
    }
    flow_config = config.get("flow") or {}
    flow_path = call_context.get("flow_path") or []
    flow_state = call_context.get("flow_state") or {}
    if flow_config or flow_path:
        flow_metadata = {"path": flow_path}
        if flow_config.get("flowId"):
            flow_metadata["flowId"] = flow_config.get("flowId")
        metadata["flow"] = flow_metadata

    return {
        "organizationId": _required(config, "organization_id"),
        "userId": config.get("user_id"),
        "agentId": flow_state.get("agent_id") or call_context.get("agent_id") or _required(config, "agent_id"),
        "callId": _required(call_context, "call_id"),
        "startTime": _isoformat(started_at),
        "endTime": _isoformat(ended_at),
        "direction": call_context.get("direction", "inbound"),
        "durationSeconds": max(0, int((ended_at - started_at).total_seconds())),
        "status": status,
        "metadata": metadata,
        "recordingSid": recording_path or "",
        "transcripts": [_normalize_transcript_item(item, index) for index, item in enumerate(transcripts)],
        "toNumber": _required(call_context, "to_number"),
        "fromNumber": _required(call_context, "from_number"),
        "provider": call_context.get("provider") or config.get("provider") or "TWILIO",
        "extractedData": config.get("data_extracted") or [],
        "evaluatedData": config.get("data_evaluation") or [],
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
    call_id = _safe_filename(str(payload.get("callId") or "unknown-call"))
    path = directory / f"{int(time.time() * 1000)}-{call_id}.json"
    path.write_text(json.dumps({"attempts": 0, "payload": payload}, sort_keys=True), encoding="utf-8")
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

    posted = 0
    failed = 0
    dead_lettered = 0
    for path in sorted(directory.glob("*.json")):
        envelope: dict[str, Any] = {}
        payload: dict[str, Any] = {}
        try:
            envelope = json.loads(path.read_text(encoding="utf-8"))
            payload = envelope.get("payload", envelope)
            await post_call_log(
                payload,
                server_api_url=server_api_url,
                internal_api_key=internal_api_key,
                post_json=post_json,
            )
            path.unlink(missing_ok=True)
            posted += 1
            emit_metric("call_log_queue", status="posted", call_id=payload.get("callId"))
        except Exception:
            failed += 1
            attempts = int(envelope.get("attempts", 0)) + 1
            if attempts >= MAX_QUEUE_ATTEMPTS:
                dead_letter_dir = directory / DEAD_LETTER_DIR_NAME
                dead_letter_dir.mkdir(parents=True, exist_ok=True)
                path.replace(dead_letter_dir / path.name)
                dead_lettered += 1
            else:
                path.write_text(
                    json.dumps({"attempts": attempts, "payload": payload}, sort_keys=True),
                    encoding="utf-8",
                )

    return {"posted": posted, "failed": failed, "dead_lettered": dead_lettered}


def _api_base_url(server_api_url: str) -> str:
    base_url = server_api_url.rstrip("/")
    if not base_url:
        return ""
    return base_url if base_url.endswith("/api/v1") else f"{base_url}/api/v1"


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
