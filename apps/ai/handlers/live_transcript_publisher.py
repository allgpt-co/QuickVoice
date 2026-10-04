from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any

from utils.logger import logger, redact_sensitive
from utils.metrics import emit_metric

try:
    import redis.asyncio as redis_asyncio
except ImportError:  # Tests and deployments without the optional live feature.
    redis_asyncio = None


LIVE_TRANSCRIPT_CHANNEL = "quickvoice:live:events"
LIVE_TRANSCRIPT_VERSION = 1
DEFAULT_TTL_SECONDS = 60 * 60
DEFAULT_QUEUE_SIZE = 256
PUBLISH_ATTEMPTS = 3

# The stream is the replay source of truth and Pub/Sub is only the low-latency
# notification path. This script makes both writes atomic, assigns the Redis
# stream id to the published envelope, and suppresses duplicate SDK callbacks.
PUBLISH_EVENT_SCRIPT = r"""
local existing = redis.call('HGET', KEYS[4], ARGV[1])
if existing then
  return existing
end

local stream_id = redis.call('XADD', KEYS[1], '*', 'event', ARGV[2])
local event = cjson.decode(ARGV[2])
event['eventId'] = stream_id
local published = cjson.encode(event)

redis.call('HSET', KEYS[4], ARGV[1], stream_id)
if event['type'] == 'call.started' then
  redis.call('HSET', KEYS[3], ARGV[3], published)
  redis.call('SET', KEYS[2], published)
elseif event['type'] == 'call.ended' then
  redis.call('HDEL', KEYS[3], ARGV[3])
  redis.call('SET', KEYS[2], published)
  redis.call('EXPIRE', KEYS[1], ARGV[4])
  redis.call('EXPIRE', KEYS[2], ARGV[4])
  redis.call('EXPIRE', KEYS[4], ARGV[4])
end

redis.call('PUBLISH', ARGV[5], published)
return stream_id
"""


class LiveTranscriptPublisher:
    """Fail-open, ordered live-call publisher for one voice session."""

    def __init__(
        self,
        *,
        config: dict[str, Any],
        call_context: dict[str, Any],
        room_name: str,
        redis_url: str | None = None,
        redis_client: Any | None = None,
        ttl_seconds: int | None = None,
        queue_size: int | None = None,
    ) -> None:
        self._organization_id = str(config.get("organization_id") or "").strip()
        self._call_id = str(call_context.get("call_id") or "").strip()
        self._room_name = str(room_name or "").strip()
        self._agent_id = str(
            config.get("agent_id") or call_context.get("agent_id") or ""
        )
        direction = str(call_context.get("direction") or "inbound").lower()
        self._direction = direction if direction in {"inbound", "outbound"} else "inbound"
        self._from_number = str(call_context.get("from_number") or "")
        self._to_number = str(call_context.get("to_number") or "")
        self._publish_transcripts = not bool(config.get("zero_pii_retention"))
        self._redis_url = redis_url or os.getenv("REDIS_URL") or "redis://localhost:6379"
        self._redis = redis_client
        self._owns_redis = redis_client is None
        self._ttl_seconds = _positive_int(
            ttl_seconds
            if ttl_seconds is not None
            else os.getenv("LIVE_TRANSCRIPT_TTL_SECONDS"),
            DEFAULT_TTL_SECONDS,
        )
        resolved_queue_size = _positive_int(
            queue_size
            if queue_size is not None
            else os.getenv("LIVE_TRANSCRIPT_QUEUE_SIZE"),
            DEFAULT_QUEUE_SIZE,
        )
        self._queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue(
            maxsize=resolved_queue_size
        )
        self._worker: asyncio.Task[None] | None = None
        self._started_at: str | None = None
        self._enabled = bool(
            self._organization_id and self._call_id and self._room_name
        ) and (redis_client is not None or redis_asyncio is not None)
        self._closed = False
        self._close_lock = asyncio.Lock()

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def start(self, started_at: datetime | str | None = None) -> None:
        if not self._enabled or self._worker is not None or self._closed:
            if not self._enabled:
                logger.warning(
                    "[LIVE_TRANSCRIPT] disabled because Redis or call identity is unavailable"
                )
            return

        if self._redis is None:
            self._redis = redis_asyncio.from_url(
                self._redis_url,
                decode_responses=True,
                socket_connect_timeout=1.5,
                socket_timeout=1.5,
                health_check_interval=30,
            )

        self._started_at = _isoformat(started_at or datetime.now(timezone.utc))
        self._worker = asyncio.create_task(
            self._run(), name=f"live-transcript-{self._call_id}"
        )
        self._enqueue(
            {
                **self._base_event("call.started"),
                **self._lifecycle_fields(),
                "status": "active",
            },
            lifecycle=True,
        )

    def publish_transcript(self, item: dict[str, Any]) -> None:
        if not self._enabled or self._closed or not self._publish_transcripts:
            return
        role = item.get("role")
        if role == "assistant":
            role = "agent"
        if role not in {"user", "agent"}:
            return
        text = str(item.get("content", item.get("message", "")) or "").strip()
        if not text:
            return
        message_id = str(item.get("id") or item.get("messageId") or "").strip()
        if not message_id:
            return
        timestamp = _isoformat(
            item.get("time") or item.get("timestamp") or datetime.now(timezone.utc)
        )
        self._enqueue(
            {
                **self._base_event("transcript.final"),
                "messageId": message_id,
                "speaker": role,
                "text": text,
                "timestamp": timestamp,
            }
        )

    async def close(
        self,
        *,
        reason: str = "session_shutdown",
        ended_at: datetime | str | None = None,
        flush_timeout: float = 3.0,
    ) -> None:
        async with self._close_lock:
            if self._closed:
                return
            self._closed = True
            if self._enabled and self._worker is not None:
                self._enqueue(
                    {
                        **self._base_event("call.ended"),
                        **self._lifecycle_fields(),
                        "status": "ended",
                        "endedAt": _isoformat(
                            ended_at or datetime.now(timezone.utc)
                        ),
                        "reason": str(reason or "session_shutdown"),
                    },
                    lifecycle=True,
                    force=True,
                )
                try:
                    await asyncio.wait_for(self._queue.join(), timeout=flush_timeout)
                except asyncio.TimeoutError:
                    logger.warning(
                        "[LIVE_TRANSCRIPT] flush timed out for call {}",
                        redact_sensitive(self._call_id),
                    )
                self._put_stop_marker()
                try:
                    await asyncio.wait_for(self._worker, timeout=1.0)
                except asyncio.TimeoutError:
                    self._worker.cancel()
                    await asyncio.gather(self._worker, return_exceptions=True)

            await self._close_redis()

    async def _run(self) -> None:
        while True:
            event = await self._queue.get()
            try:
                if event is None:
                    return
                await self._publish_with_retry(event)
            except Exception as error:
                emit_metric(
                    "live_transcript_publish",
                    status="failed",
                    call_id=self._call_id,
                    event_type=event.get("type") if event else "unknown",
                )
                logger.warning(
                    "[LIVE_TRANSCRIPT] publish failed: {}",
                    redact_sensitive(str(error)),
                )
            finally:
                self._queue.task_done()

    async def _publish_with_retry(self, event: dict[str, Any]) -> None:
        if self._redis is None:
            return
        last_error: Exception | None = None
        for attempt in range(PUBLISH_ATTEMPTS):
            try:
                await self._publish(event)
                emit_metric(
                    "live_transcript_publish",
                    status="ok",
                    call_id=self._call_id,
                    event_type=event["type"],
                )
                return
            except Exception as error:
                last_error = error
                if attempt < PUBLISH_ATTEMPTS - 1:
                    await asyncio.sleep(0.1 * (2**attempt))
        if last_error is not None:
            raise last_error

    async def _publish(self, event: dict[str, Any]) -> str:
        event_type = str(event["type"])
        if event_type == "call.started":
            dedup_token = "lifecycle:started"
        elif event_type == "call.ended":
            dedup_token = "lifecycle:ended"
        else:
            dedup_token = (
                f"transcript:{event.get('speaker', '')}:{event.get('messageId', '')}"
            )
        result = await self._redis.eval(
            PUBLISH_EVENT_SCRIPT,
            4,
            self._stream_key,
            self._metadata_key,
            self._active_key,
            self._dedup_key,
            dedup_token,
            json.dumps(event, separators=(",", ":"), ensure_ascii=False),
            self._call_id,
            str(self._ttl_seconds),
            LIVE_TRANSCRIPT_CHANNEL,
        )
        return str(result)

    def _enqueue(
        self,
        event: dict[str, Any],
        *,
        lifecycle: bool = False,
        force: bool = False,
    ) -> None:
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            if force:
                try:
                    self._queue.get_nowait()
                    self._queue.task_done()
                    self._queue.put_nowait(event)
                    return
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    pass
            emit_metric(
                "live_transcript_queue",
                status="dropped",
                call_id=self._call_id,
                event_type=event.get("type"),
            )
            logger.warning(
                "[LIVE_TRANSCRIPT] dropped {} event because the queue is full",
                "lifecycle" if lifecycle else "transcript",
            )

    def _put_stop_marker(self) -> None:
        try:
            self._queue.put_nowait(None)
        except asyncio.QueueFull:
            if self._worker is not None:
                self._worker.cancel()

    def _base_event(self, event_type: str) -> dict[str, Any]:
        return {
            "version": LIVE_TRANSCRIPT_VERSION,
            "type": event_type,
            "organizationId": self._organization_id,
            "callId": self._call_id,
            "roomName": self._room_name,
            "occurredAt": _isoformat(datetime.now(timezone.utc)),
        }

    def _lifecycle_fields(self) -> dict[str, Any]:
        return {
            "agentId": self._agent_id,
            "direction": self._direction,
            "fromNumber": self._from_number,
            "toNumber": self._to_number,
            "startedAt": self._started_at or _isoformat(datetime.now(timezone.utc)),
        }

    @property
    def _stream_key(self) -> str:
        return f"quickvoice:live:stream:{self._organization_id}:{self._call_id}"

    @property
    def _metadata_key(self) -> str:
        return f"quickvoice:live:metadata:{self._organization_id}:{self._call_id}"

    @property
    def _active_key(self) -> str:
        return f"quickvoice:live:active:{self._organization_id}"

    @property
    def _dedup_key(self) -> str:
        return f"quickvoice:live:dedup:{self._organization_id}:{self._call_id}"

    async def _close_redis(self) -> None:
        if self._redis is None or not self._owns_redis:
            return
        close = getattr(self._redis, "aclose", None) or getattr(
            self._redis, "close", None
        )
        if close is not None:
            result = close()
            if asyncio.iscoroutine(result):
                await result


def _positive_int(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


def _isoformat(value: Any) -> str:
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, (int, float)):
        value = datetime.fromtimestamp(value, tz=timezone.utc)
    if not isinstance(value, datetime):
        value = datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
