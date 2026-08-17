"""Low-latency, cumulative billing usage export for voice sessions.

This module deliberately has no LiveKit imports. The worker adapter in ``main.py``
passes LiveKit's cumulative ``session.usage`` object into the serializer, while
unit tests can use plain dataclasses and mappings.
"""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import math
import os
import re
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import asdict, dataclass, is_dataclass
from datetime import date, datetime
from enum import Enum
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from utils.billing_mode import hosted_billing_required
from utils.logger import logger, redact_sensitive


DEFAULT_REPORT_INTERVAL_SECONDS = 10.0
DEFAULT_RETRY_ATTEMPTS = 3
DEFAULT_RETRY_BACKOFF_SECONDS = 0.25
DEFAULT_HTTP_TIMEOUT_SECONDS = 5.0
DEFAULT_MAX_REPORTING_GAP_SECONDS = 50.0
DEFAULT_TERMINATION_RETRY_ATTEMPTS = 5
DEFAULT_TERMINATION_TIMEOUT_SECONDS = 5.0
DEFAULT_QUEUE_POLL_SECONDS = 5.0
MAX_QUEUE_RETRY_BACKOFF_SECONDS = 300.0
QUEUE_CLAIM_STALE_SECONDS = 300.0
MAX_RESERVE_WINDOW_SECONDS = 60.0
QUEUE_DIR_ENV = "AI_BILLING_USAGE_QUEUE_DIR"
DEFAULT_QUEUE_DIR = "/tmp/quickvoice-ai-billing-usage"
DEAD_LETTER_DIR_NAME = "dead-letter"

PostJson = Callable[
    [str, dict[str, str], dict[str, Any]],
    Awaitable[dict[str, Any]] | dict[str, Any],
]
StopSession = Callable[[str], Awaitable[None] | None]


@dataclass(frozen=True)
class BillingUsageIdentifiers:
    call_id: str
    session_id: str
    room_name: str
    organization_id: str
    user_id: str | None = None
    agent_id: str | None = None
    telephony_provider: str | None = None
    provider_call_id: str | None = None


class BillingUsageReporter:
    """Exports cumulative session usage without adding work to the audio path."""

    def __init__(
        self,
        *,
        identifiers: BillingUsageIdentifiers,
        usage_supplier: Callable[[], Any] | None = None,
        stop_session: StopSession | None = None,
        server_api_url: str | None = None,
        internal_api_key: str | None = None,
        post_json: PostJson | None = None,
        interval_seconds: float = DEFAULT_REPORT_INTERVAL_SECONDS,
        retry_attempts: int = DEFAULT_RETRY_ATTEMPTS,
        retry_backoff_seconds: float = DEFAULT_RETRY_BACKOFF_SECONDS,
        monotonic: Callable[[], float] = time.monotonic,
        connected_at_monotonic: float | None = None,
        max_reporting_gap_seconds: float | None = None,
        required: bool | None = None,
        canonical_model_ids: Mapping[str, str] | None = None,
        queue_dir: str | Path | None = None,
        termination_retry_attempts: int = DEFAULT_TERMINATION_RETRY_ATTEMPTS,
        termination_timeout_seconds: float = DEFAULT_TERMINATION_TIMEOUT_SECONDS,
    ) -> None:
        raw_base_url = os.getenv("SERVER_API_URL") if server_api_url is None else server_api_url
        raw_api_key = os.getenv("INTERNAL_API_KEY") if internal_api_key is None else internal_api_key

        self._identifiers = identifiers
        self._base_url = _api_base_url(raw_base_url or "")
        self._internal_api_key = (raw_api_key or "").strip()
        self._usage_supplier = usage_supplier
        self._stop_session = stop_session
        self._post_json = post_json or _post_json
        self._max_reporting_gap_seconds = min(
            MAX_RESERVE_WINDOW_SECONDS - 5.0,
            max(1.0, _max_reporting_gap_seconds(max_reporting_gap_seconds)),
        )
        self._interval_seconds = min(
            self._max_reporting_gap_seconds,
            max(0.001, float(interval_seconds)),
        )
        self._retry_attempts = max(1, int(retry_attempts))
        self._retry_backoff_seconds = max(0.0, float(retry_backoff_seconds))
        self._monotonic = monotonic
        now = monotonic()
        self._started_monotonic = (
            float(connected_at_monotonic)
            if connected_at_monotonic is not None
            and math.isfinite(float(connected_at_monotonic))
            else now
        )
        self._required = hosted_billing_required() if required is None else bool(required)
        self._canonical_model_ids = {
            str(kind).strip().lower(): str(model_id).strip()
            for kind, model_id in (canonical_model_ids or {}).items()
            if str(model_id).strip()
        }
        raw_queue_dir = (
            os.getenv(QUEUE_DIR_ENV) if queue_dir is None else str(queue_dir)
        )
        self._queue_dir = raw_queue_dir.strip() if raw_queue_dir else None
        self._durable_queue_configured = bool(
            self._queue_dir and Path(self._queue_dir).is_absolute()
        )

        self._cached_model_usage: list[dict[str, Any]] = []
        self._sequence = 0
        self._last_success_monotonic: float | None = None
        self._report_lock = asyncio.Lock()
        self._periodic_task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()
        self._closed = False
        self._closing = False
        self._stop_requested = False
        self._termination_retry_attempts = max(1, int(termination_retry_attempts))
        self._termination_timeout_seconds = max(
            0.05, float(termination_timeout_seconds)
        )
        self._termination_task: asyncio.Task[None] | None = None
        self._termination_completed = False
        self._termination_reason: str | None = None

    @property
    def enabled(self) -> bool:
        return bool(
            self._base_url
            and self._internal_api_key
            and self._identifiers.organization_id
            and self._identifiers.call_id
            and self._identifiers.session_id
            and (not self._required or self._durable_queue_configured)
        )

    @property
    def stop_requested(self) -> bool:
        return self._stop_requested

    @property
    def required(self) -> bool:
        return self._required

    def update_usage(self, usage: Any) -> None:
        """Copy a cumulative usage event synchronously; never perform network I/O."""

        self._cached_model_usage = serialize_session_usage(
            usage,
            canonical_model_ids=self._canonical_model_ids,
        )

    async def authorize(self) -> bool:
        """Require an initial reserve/admission response before paid processing."""

        if self._closed:
            return False
        if not self.enabled:
            if self._required:
                await self._request_stop("billing_configuration_missing")
                return False
            return True

        delivered = await self.report_now()
        if self._stop_requested:
            return False
        if delivered:
            return True
        if self._required:
            await self._request_stop("billing_reporting_unavailable")
            return False
        return True

    async def start(self) -> None:
        """Start the periodic sender and return without waiting for HTTP."""

        if not self.enabled:
            logger.info(
                "[BILLING_USAGE] reporting disabled because server credentials or identifiers are missing"
            )
            if self._required:
                await self._request_stop("billing_configuration_missing")
            return
        if self._closed or (self._periodic_task and not self._periodic_task.done()):
            return

        self._periodic_task = asyncio.create_task(
            self._periodic_loop(),
            name=f"billing-usage-{self._identifiers.session_id}",
        )
        # Give the task one event-loop turn. The HTTP work itself remains detached
        # from the caller/audio coroutine.
        await asyncio.sleep(0)

    async def report_now(self, *, final: bool = False) -> bool:
        if self._closed:
            return False

        stop_reason: str | None = None
        async with self._report_lock:
            if self._closed:
                return False

            model_usage = self._read_latest_usage()
            self._sequence += 1
            payload = self._build_payload(
                sequence=self._sequence,
                model_usage=model_usage,
                final=final,
            )
            headers = self._build_headers(payload["sequence"])
            if not self.enabled:
                if final and self._required:
                    self._enqueue_final(payload)
                return False

            attempts = max(self._retry_attempts, 5) if final else self._retry_attempts
            response = await self._send_with_retry(payload, headers, attempts=attempts)
            if response is None:
                if final and self._required:
                    self._enqueue_final(payload)
                elif self._required and self._reporting_gap_exhausted():
                    stop_reason = "billing_reporting_unavailable"
                delivered = False
            else:
                self._last_success_monotonic = self._monotonic()
                delivered = True

            server_stop_reason = response_requests_stop(response)
            if server_stop_reason is not None:
                if final:
                    # The session is already shutting down; retain the server's
                    # stop state without recursively invoking lifecycle hooks.
                    self._stop_requested = True
                    self._stop_event.set()
                else:
                    stop_reason = server_stop_reason

        if stop_reason is not None:
            await self._request_stop(stop_reason)
        return delivered

    async def close(self, final_usage: Any = None) -> None:
        """Stop periodic work and make one best-effort final cumulative export."""

        if self._closed or self._closing:
            return
        self._closing = True
        self._stop_event.set()

        periodic_task = self._periodic_task
        if periodic_task and periodic_task is not asyncio.current_task() and not periodic_task.done():
            periodic_task.cancel()
            await asyncio.gather(periodic_task, return_exceptions=True)

        if final_usage is not None:
            self.update_usage(final_usage)

        try:
            await self.report_now(final=True)
        finally:
            self._closed = True
            self._closing = False

    async def _periodic_loop(self) -> None:
        try:
            if self._last_success_monotonic is None and not await self.authorize():
                return
            while not self._stop_requested and not self._closing:
                timeout = self._interval_seconds
                remaining = self._remaining_reporting_time()
                if remaining is not None:
                    if remaining <= 0:
                        await self._request_stop("billing_reporting_unavailable")
                        break
                    timeout = min(timeout, remaining)
                try:
                    await asyncio.wait_for(
                        self._stop_event.wait(),
                        timeout=timeout,
                    )
                    break
                except TimeoutError:
                    await self.report_now()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.warning(
                "[BILLING_USAGE] periodic reporter stopped unexpectedly: {}",
                redact_sensitive(str(error)),
            )
            if self._required:
                await self._request_stop("billing_reporter_failed")

    def _read_latest_usage(self) -> list[dict[str, Any]]:
        if self._usage_supplier is None:
            return [dict(item) for item in self._cached_model_usage]
        try:
            supplied = serialize_session_usage(
                self._usage_supplier(),
                canonical_model_ids=self._canonical_model_ids,
            )
        except Exception as error:
            logger.warning(
                "[BILLING_USAGE] could not read cumulative session usage: {}",
                redact_sensitive(str(error)),
            )
            return [dict(item) for item in self._cached_model_usage]
        self._cached_model_usage = supplied
        return [dict(item) for item in supplied]

    def _build_payload(
        self,
        *,
        sequence: int,
        model_usage: list[dict[str, Any]],
        final: bool,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "callId": self._identifiers.call_id,
            "sessionId": self._identifiers.session_id,
            "roomName": self._identifiers.room_name,
            "organizationId": self._identifiers.organization_id,
            "sequence": sequence,
            "connectedSeconds": round(
                max(0.0, self._monotonic() - self._started_monotonic),
                3,
            ),
            "modelUsage": model_usage,
            "final": bool(final),
        }
        if self._identifiers.user_id:
            payload["userId"] = self._identifiers.user_id
        if self._identifiers.agent_id:
            payload["agentId"] = self._identifiers.agent_id
        if self._identifiers.telephony_provider:
            payload["telephonyProvider"] = self._identifiers.telephony_provider
        if self._identifiers.provider_call_id:
            payload["providerCallId"] = self._identifiers.provider_call_id
        return payload

    def _build_headers(self, sequence: int) -> dict[str, str]:
        return _billing_usage_headers(
            session_id=self._identifiers.session_id,
            sequence=sequence,
            organization_id=self._identifiers.organization_id,
            user_id=self._identifiers.user_id,
            internal_api_key=self._internal_api_key,
        )

    async def _send_with_retry(
        self,
        payload: dict[str, Any],
        headers: dict[str, str],
        *,
        attempts: int,
    ) -> dict[str, Any] | None:
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                result = self._post_json(
                    f"{self._base_url}/billing/calls/usage",
                    headers,
                    payload,
                )
                if inspect.isawaitable(result):
                    remaining = self._remaining_reporting_time()
                    timeout = max(0.05, remaining) if remaining is not None else None
                    response = (
                        await asyncio.wait_for(result, timeout=timeout)
                        if timeout is not None
                        else await result
                    )
                else:
                    response = result
                return response if isinstance(response, dict) else {}
            except Exception as error:
                last_error = error
                if attempt < attempts - 1:
                    delay = self._retry_backoff_seconds * (2**attempt)
                    remaining = self._remaining_reporting_time()
                    if remaining is not None:
                        if remaining <= 0:
                            break
                        delay = min(delay, remaining)
                    await asyncio.sleep(delay)

        logger.warning(
            "[BILLING_USAGE] snapshot delivery failed after {} attempts: {}",
            attempts,
            redact_sensitive(str(last_error or "unknown error")),
        )
        return None

    def _remaining_reporting_time(self) -> float | None:
        if not self._required or self._last_success_monotonic is None:
            return None
        elapsed = max(0.0, self._monotonic() - self._last_success_monotonic)
        return max(0.0, self._max_reporting_gap_seconds - elapsed)

    def _reporting_gap_exhausted(self) -> bool:
        remaining = self._remaining_reporting_time()
        return remaining is not None and remaining <= 0

    def _enqueue_final(self, payload: dict[str, Any]) -> None:
        try:
            path = enqueue_billing_usage_snapshot(payload, queue_dir=self._queue_dir)
            logger.warning(
                "[BILLING_USAGE] final snapshot queued for durable retry at {}",
                redact_sensitive(str(path)),
            )
        except Exception as error:
            logger.error(
                "[BILLING_USAGE] could not persist final snapshot: {}",
                redact_sensitive(str(error)),
            )

    async def _request_stop(self, reason: str) -> None:
        first_request = not self._stop_requested
        self._stop_requested = True
        self._stop_event.set()
        if self._termination_reason is None:
            self._termination_reason = reason
        if first_request:
            logger.warning(
                "[BILLING_USAGE] server requested session termination: {}",
                redact_sensitive(reason),
            )
        if self._stop_session is None or self._termination_completed:
            return
        if self._termination_task is None or self._termination_task.done():
            self._termination_task = asyncio.create_task(
                self._run_termination_watchdog(),
                name=f"billing-stop-{self._identifiers.session_id}",
            )
        await asyncio.shield(self._termination_task)

    async def _run_termination_watchdog(self) -> None:
        reason = self._termination_reason or "insufficient_funds"
        last_error: Exception | None = None
        for attempt in range(self._termination_retry_attempts):
            try:
                result = self._stop_session(reason) if self._stop_session else None
                if inspect.isawaitable(result):
                    await asyncio.wait_for(
                        result,
                        timeout=self._termination_timeout_seconds,
                    )
                self._termination_completed = True
                return
            except Exception as error:
                last_error = error
                logger.error(
                    "[BILLING_USAGE] termination attempt {}/{} failed: {}",
                    attempt + 1,
                    self._termination_retry_attempts,
                    redact_sensitive(str(error)),
                )
                if attempt < self._termination_retry_attempts - 1:
                    await asyncio.sleep(
                        min(1.0, self._retry_backoff_seconds * (2**attempt))
                    )
        logger.critical(
            "[BILLING_USAGE] termination watchdog exhausted for session {}: {}",
            redact_sensitive(self._identifiers.session_id),
            redact_sensitive(str(last_error or "unknown error")),
        )


def serialize_session_usage(
    usage: Any,
    *,
    canonical_model_ids: Mapping[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Return stable JSON-safe cumulative per-model usage entries."""

    entries = _model_usage_entries(usage)
    serialized: list[dict[str, Any]] = []
    for entry in entries:
        raw = _object_mapping(entry)
        if not raw:
            continue
        normalized = {
            str(key): _json_safe(value)
            for key, value in raw.items()
            if value is not None and not str(key).startswith("_") and not callable(value)
        }
        kind = _usage_kind(normalized)
        canonical_model = (canonical_model_ids or {}).get(kind or "")
        if canonical_model:
            normalized["model"] = canonical_model
            if "/" in canonical_model:
                normalized["provider"] = canonical_model.split("/", 1)[0]
        if normalized:
            serialized.append(normalized)

    serialized.sort(
        key=lambda item: (
            str(item.get("type", "")),
            str(item.get("provider", "")),
            str(item.get("model", "")),
        )
    )
    return serialized


def enqueue_billing_usage_snapshot(
    payload: dict[str, Any],
    *,
    queue_dir: str | Path | None = None,
) -> Path:
    if payload.get("final") is not True:
        raise ValueError("only final billing usage snapshots may be queued")
    directory = _queue_dir(queue_dir)
    directory.mkdir(parents=True, exist_ok=True)
    session_id = str(payload.get("sessionId") or "unknown-session")
    sequence = int(payload.get("sequence") or 0)
    digest = hashlib.sha256(f"{session_id}:{sequence}".encode("utf-8")).hexdigest()[:16]
    path = directory / f"{_safe_filename(session_id)}-{sequence}-{digest}.json"
    _atomic_write_json(path, {"attempts": 0, "payload": payload})
    return path


async def flush_billing_usage_queue(
    *,
    queue_dir: str | Path | None = None,
    server_api_url: str | None = None,
    internal_api_key: str | None = None,
    post_json: PostJson | None = None,
) -> dict[str, int]:
    directory = _queue_dir(queue_dir)
    if not directory.exists():
        return {"posted": 0, "failed": 0, "dead_lettered": 0}

    _reclaim_stale_queue_claims(directory)

    base_url = _api_base_url(server_api_url or os.getenv("SERVER_API_URL") or "")
    api_key = (internal_api_key or os.getenv("INTERNAL_API_KEY") or "").strip()
    if not base_url or not api_key:
        return {"posted": 0, "failed": len(list(directory.glob("*.json"))), "dead_lettered": 0}

    sender = post_json or _post_json
    posted = 0
    failed = 0
    dead_lettered = 0
    for path in sorted(directory.glob("*.json")):
        claimed_path = path.with_name(f"{path.name}.processing")
        try:
            path.rename(claimed_path)
        except FileNotFoundError:
            # Another worker atomically claimed this envelope.
            continue
        except OSError as error:
            logger.warning(
                "[BILLING_USAGE] could not claim queued envelope {}: {}",
                redact_sensitive(str(path)),
                redact_sensitive(str(error)),
            )
            failed += 1
            continue

        envelope: dict[str, Any] = {}
        try:
            envelope = json.loads(claimed_path.read_text(encoding="utf-8"))
            next_attempt_at = float(envelope.get("nextAttemptAtEpoch", 0) or 0)
            if next_attempt_at > time.time():
                claimed_path.rename(path)
                continue
            payload = envelope.get("payload")
            if not isinstance(payload, dict) or payload.get("final") is not True:
                raise ValueError("queued billing envelope has no final payload")
            session_id = str(payload.get("sessionId") or "")
            organization_id = str(payload.get("organizationId") or "")
            sequence = int(payload.get("sequence") or 0)
            if not session_id or not organization_id or sequence <= 0:
                raise ValueError("queued billing payload identifiers are incomplete")
        except Exception:
            dead_letter_dir = directory / DEAD_LETTER_DIR_NAME
            dead_letter_dir.mkdir(parents=True, exist_ok=True)
            claimed_path.replace(dead_letter_dir / path.name)
            dead_lettered += 1
            continue

        headers = _billing_usage_headers(
            session_id=session_id,
            sequence=sequence,
            organization_id=organization_id,
            user_id=str(payload.get("userId") or "") or None,
            internal_api_key=api_key,
        )
        try:
            result = sender(f"{base_url}/billing/calls/usage", headers, payload)
            if inspect.isawaitable(result):
                await result
            claimed_path.unlink(missing_ok=True)
            posted += 1
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


async def run_billing_usage_queue_consumer(
    *,
    queue_dir: str | Path | None = None,
    server_api_url: str | None = None,
    internal_api_key: str | None = None,
    post_json: PostJson | None = None,
    poll_seconds: float = DEFAULT_QUEUE_POLL_SECONDS,
    stop_event: asyncio.Event | None = None,
) -> None:
    """Continuously deliver final snapshots, including before the next call."""

    interval = max(0.05, float(poll_seconds))
    while stop_event is None or not stop_event.is_set():
        try:
            result = await flush_billing_usage_queue(
                queue_dir=queue_dir,
                server_api_url=server_api_url,
                internal_api_key=internal_api_key,
                post_json=post_json,
            )
            if result["failed"] or result["dead_lettered"]:
                logger.error(
                    "[BILLING_USAGE] durable queue drain requires attention: {}",
                    redact_sensitive(result),
                )
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.error(
                "[BILLING_USAGE] durable queue consumer failed: {}",
                redact_sensitive(str(error)),
            )

        if stop_event is None:
            await asyncio.sleep(interval)
            continue
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except TimeoutError:
            pass


def _reclaim_stale_queue_claims(directory: Path) -> None:
    stale_before = time.time() - QUEUE_CLAIM_STALE_SECONDS
    for claimed_path in directory.glob("*.json.processing"):
        try:
            if claimed_path.stat().st_mtime > stale_before:
                continue
            original_path = claimed_path.with_name(
                claimed_path.name.removesuffix(".processing")
            )
            if original_path.exists():
                claimed_path.unlink(missing_ok=True)
            else:
                claimed_path.rename(original_path)
        except FileNotFoundError:
            continue


def response_requests_stop(response: Mapping[str, Any] | None) -> str | None:
    if not isinstance(response, Mapping):
        return None

    nested = response.get("data")
    data = nested if isinstance(nested, Mapping) else response
    status_code = response.get("statusCode", response.get("status"))
    action = str(data.get("action", "")).strip().lower()
    denied = data.get("allowed") is False or data.get("canContinue") is False
    if status_code != 402 and action not in {"stop", "end", "terminate"} and not denied:
        return None

    reason = (
        data.get("reason")
        or data.get("message")
        or response.get("reason")
        or response.get("message")
        or "insufficient_funds"
    )
    return str(reason)


def _model_usage_entries(usage: Any) -> Sequence[Any]:
    if usage is None:
        return []
    if isinstance(usage, Mapping):
        value = usage.get("model_usage", usage.get("modelUsage", []))
    else:
        value = getattr(usage, "model_usage", None)
        if value is None:
            value = getattr(usage, "modelUsage", [])
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return value
    return []


def _usage_kind(entry: Mapping[str, Any]) -> str | None:
    usage_type = str(entry.get("type", "")).lower()
    if "stt" in usage_type or "speech_to_text" in usage_type:
        return "stt"
    if "llm" in usage_type:
        return "llm"
    if "tts" in usage_type or "text_to_speech" in usage_type:
        return "tts"
    if "characters_count" in entry or "characters" in entry:
        return "tts"
    if "input_tokens" in entry or "output_tokens" in entry:
        return "llm"
    if "audio_duration" in entry:
        return "stt"
    return None


def _object_mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            dumped = model_dump(mode="json")
        except TypeError:
            dumped = model_dump()
        if isinstance(dumped, Mapping):
            return dict(dumped)
    if is_dataclass(value) and not isinstance(value, type):
        dumped = asdict(value)
        return dumped if isinstance(dumped, dict) else {}
    value_dict = getattr(value, "__dict__", None)
    if isinstance(value_dict, dict):
        return dict(value_dict)

    known_fields = (
        "type",
        "provider",
        "model",
        "input_tokens",
        "input_cached_tokens",
        "input_audio_tokens",
        "input_cached_audio_tokens",
        "input_text_tokens",
        "input_cached_text_tokens",
        "input_image_tokens",
        "input_cached_image_tokens",
        "output_tokens",
        "output_audio_tokens",
        "output_text_tokens",
        "session_duration",
        "characters_count",
        "audio_duration",
        "total_requests",
    )
    return {
        field: getattr(value, field)
        for field in known_fields
        if hasattr(value, field)
    }


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else 0.0
    if isinstance(value, Enum):
        return _json_safe(value.value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {
            str(key): _json_safe(child)
            for key, child in value.items()
            if child is not None
        }
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_json_safe(child) for child in value]
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    try:
        numeric = float(value)
    except (TypeError, ValueError, OverflowError):
        return str(value)
    return numeric if math.isfinite(numeric) else 0.0


def _api_base_url(server_api_url: str) -> str:
    base_url = server_api_url.rstrip("/")
    if not base_url:
        return ""
    return base_url if base_url.endswith("/api/v1") else f"{base_url}/api/v1"


async def _post_json(
    url: str,
    headers: dict[str, str],
    body: dict[str, Any],
) -> dict[str, Any]:
    return await asyncio.to_thread(_blocking_post_json, url, headers, body)


def _blocking_post_json(
    url: str,
    headers: dict[str, str],
    body: dict[str, Any],
) -> dict[str, Any]:
    request = Request(
        url,
        data=json.dumps(body, allow_nan=False, separators=(",", ":")).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    timeout = _http_timeout_seconds()
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        if error.code != 402:
            raise
        payload = _decode_json_object(raw)
        payload["statusCode"] = 402
        return payload
    return _decode_json_object(raw)


def _decode_json_object(raw: str) -> dict[str, Any]:
    if not raw.strip():
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {"message": raw[:500]}
    return payload if isinstance(payload, dict) else {"data": payload}


def _http_timeout_seconds() -> float:
    raw = os.getenv("AI_BILLING_HTTP_TIMEOUT_SECONDS", "")
    try:
        return max(0.1, float(raw)) if raw else DEFAULT_HTTP_TIMEOUT_SECONDS
    except ValueError:
        return DEFAULT_HTTP_TIMEOUT_SECONDS


def _max_reporting_gap_seconds(value: float | None) -> float:
    if value is not None:
        return float(value)
    raw = os.getenv("AI_BILLING_MAX_REPORTING_GAP_SECONDS", "")
    try:
        return float(raw) if raw else DEFAULT_MAX_REPORTING_GAP_SECONDS
    except ValueError:
        return DEFAULT_MAX_REPORTING_GAP_SECONDS


def _billing_usage_headers(
    *,
    session_id: str,
    sequence: int,
    organization_id: str,
    user_id: str | None,
    internal_api_key: str,
) -> dict[str, str]:
    idempotency_source = f"{session_id}:{sequence}".encode("utf-8")
    idempotency_digest = hashlib.sha256(idempotency_source).hexdigest()
    headers = {
        "Authorization": f"Bearer {internal_api_key}",
        "Content-Type": "application/json",
        "Idempotency-Key": f"quickvoice-usage-{idempotency_digest}",
        "x-organization-id": organization_id,
        # Internal auth still requires a non-empty actor. Keep creator
        # attribution nullable in the payload while authenticating deleted-user
        # or organization-owned agents as this deterministic service principal.
        "x-user-id": user_id or "system:voice-worker",
    }
    return headers


def _queue_dir(queue_dir: str | Path | None = None) -> Path:
    return Path(queue_dir or os.getenv(QUEUE_DIR_ENV) or DEFAULT_QUEUE_DIR)


def _safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-") or "session"


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
