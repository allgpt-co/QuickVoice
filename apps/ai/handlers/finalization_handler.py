import asyncio
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from handlers.calllog_handler import build_call_log_payload, post_call_log_with_retry
from handlers.langfuse_evaluation_handler import LangfuseEvaluationHandler
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
        langfuse_evaluation_handler: LangfuseEvaluationHandler | None = None,
    ):
        self._config = config
        self._call_context = call_context
        self._started_at = started_at
        self._recording_path = recording_path
        self._transcript_reader = transcript_reader
        self._post_call_log = post_call_log or post_call_log_with_retry
        self._langfuse_evaluation_handler = (
            langfuse_evaluation_handler
            if langfuse_evaluation_handler is not None
            else LangfuseEvaluationHandler.from_env()
        )
        self._lock = asyncio.Lock()
        self._completed = False

    async def finalize(self) -> None:
        async with self._lock:
            if self._completed:
                return
            self._completed = True

            ended_at = datetime.now(timezone.utc)
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
            await self._post_call_log(payload)
            if self._langfuse_evaluation_handler is not None:
                self._langfuse_evaluation_handler.publish_call_evaluations(
                    config=self._config,
                    call_context=self._call_context,
                    started_at=self._started_at,
                    ended_at=ended_at,
                    transcripts=transcript,
                    payload=payload,
                )
            logger.info("[CALL_LOG] finalized call {}", redact_sensitive({"callId": payload["callId"]}))
