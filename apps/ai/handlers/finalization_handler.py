import asyncio
import hashlib
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from handlers.calllog_handler import build_call_log_payload, post_call_log_with_retry
from handlers.post_call_webhook_handler import enqueue_post_call_webhook
from handlers.webhook_events import report_webhook_event
from utils.logger import logger, redact_sensitive


class CallFinalizer:
    def __init__(
        self,
        *,
        config: dict[str, Any],
        call_context: dict[str, Any],
        started_at: datetime,
        recording_path: str | None,
        transcript_reader: Callable[[], list[dict[str, Any]]],
        post_call_log: Callable[[dict[str, Any]], Awaitable[Any]] | None = None,
        enqueue_webhook: Callable[[dict[str, Any]], Any] = enqueue_post_call_webhook,
    ):
        self._config = config
        self._call_context = call_context
        self._started_at = started_at
        self._recording_path = recording_path
        self._transcript_reader = transcript_reader
        self._post_call_log = post_call_log or post_call_log_with_retry
        self._enqueue_webhook = enqueue_webhook
        self._lock = asyncio.Lock()
        self._completed = False

    async def finalize(self, *, ended_at: datetime | None = None) -> None:
        async with self._lock:
            if self._completed:
                return
            self._completed = True

            ended_at = ended_at or datetime.now(timezone.utc)
            zero_pii_retention = bool(self._config.get("zero_pii_retention"))
            transcript = [] if zero_pii_retention else self._transcript_reader()
            payload = build_call_log_payload(
                config=self._config,
                call_context=self._call_context,
                started_at=self._started_at,
                ended_at=ended_at,
                recording_path=None if zero_pii_retention else self._recording_path,
                transcripts=transcript,
            )
            if zero_pii_retention:
                payload["metadata"]["zeroPiiRetention"] = True
                payload["extractedData"] = []
                payload["evaluatedData"] = []
            if self._config.get("retention_days") is not None:
                payload["metadata"]["retentionDays"] = self._config.get("retention_days")
            webhook_queue_error = None
            if self._config.get("post_call_webhook"):
                try:
                    url = str(self._config["post_call_webhook"]["webhook_url"])
                    queue_payload = {
                        **payload,
                        "_webhookDestinationHash": hashlib.sha256(url.encode()).hexdigest(),
                    }
                    await asyncio.to_thread(self._enqueue_webhook, queue_payload)
                except Exception as error:
                    webhook_queue_error = error
            await self._post_call_log(payload)
            if webhook_queue_error is not None:
                logger.error("[webhook:post-call] could not queue delivery: {}", redact_sensitive(str(webhook_queue_error)))
                await report_webhook_event(self._config, "post_call", "failed", "delivery_error")
            logger.info("[CALL_LOG] finalized call {}", redact_sensitive({"callId": payload["callId"]}))
