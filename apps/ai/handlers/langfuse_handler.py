from __future__ import annotations

import json
import os
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from typing import Any

from utils.logger import logger, redact_sensitive

TRACE_NAME = "quickvoice.voice_call"
MAX_METADATA_TEXT_LENGTH = 200


class LangfuseCallObserver:
    """Fail-open, privacy-safe Langfuse state for one voice call or preview."""

    def __init__(
        self,
        *,
        env: Mapping[str, str] | None = None,
        client_factory: Callable[..., Any] | None = None,
    ) -> None:
        self._env = env if env is not None else os.environ
        self._client_factory = client_factory
        self._client: Any = None
        self._root: Any = None
        self._trace_id: str | None = None
        self._enabled = False
        self._evaluation_enabled = False
        self._finished = False
        self._shutdown = False
        self._scores: dict[str, float] = {}
        self._turns: list[dict[str, Any]] = []
        self._tool_attempts = 0
        self._tool_successes = 0
        self._rag_attempts = 0
        self._rag_successes = 0
        self._room_name = ""
        self._call_context: dict[str, Any] = {}
        self._preview_mode = False

    @property
    def enabled(self) -> bool:
        return self._enabled

    def start_call(
        self,
        *,
        room_name: str,
        call_context: dict[str, Any],
        config: dict[str, Any],
        preview_mode: bool = False,
    ) -> None:
        if not _env_bool(self._env, "LANGFUSE_ENABLED", False):
            return

        public_key = self._env.get("LANGFUSE_PUBLIC_KEY", "").strip()
        secret_key = self._env.get("LANGFUSE_SECRET_KEY", "").strip()
        if not public_key or not secret_key:
            logger.warning("[LANGFUSE] disabled because credentials are missing")
            return

        try:
            factory = self._client_factory or _langfuse_client_factory
            self._client = factory(
                public_key=public_key,
                secret_key=secret_key,
                base_url=self._env.get("LANGFUSE_HOST", "https://cloud.langfuse.com"),
                environment=self._env.get("LANGFUSE_ENVIRONMENT", "development"),
                release=self._env.get("LANGFUSE_RELEASE") or None,
                sample_rate=_sample_rate(self._env.get("LANGFUSE_SAMPLE_RATE", "1.0")),
            )
            trace_seed = str(call_context.get("call_id") or room_name or "quickvoice-call")
            self._trace_id = self._client.create_trace_id(seed=f"quickvoice:{trace_seed}")
            self._root = self._client.start_observation(
                name=TRACE_NAME,
                as_type="agent",
                trace_context={"trace_id": self._trace_id},
                metadata=_root_metadata(
                    room_name=room_name,
                    call_context=call_context,
                    config=config,
                    preview_mode=preview_mode,
                    environment=self._env.get("LANGFUSE_ENVIRONMENT", "development"),
                    release=self._env.get("LANGFUSE_RELEASE", ""),
                ),
            )
            self._evaluation_enabled = _env_bool(
                self._env, "LANGFUSE_EVALUATION_ENABLED", True
            )
            self._room_name = room_name
            self._call_context = dict(call_context)
            self._preview_mode = preview_mode
            self._enabled = True
        except Exception as error:
            self._disable_after_error("start call", error)

    def record_configuration(
        self,
        *,
        success: bool,
        duration_seconds: float,
        config: dict[str, Any] | None = None,
    ) -> None:
        metadata = {
            "success": success,
            "duration_ms": _duration_ms(duration_seconds),
        }
        if config:
            metadata.update(
                {
                    "language": _safe_text(config.get("agent_language")),
                    "stt_model": _safe_text(config.get("stt_model")),
                    "llm_model": _safe_text(config.get("llm_model")),
                    "tts_model": _safe_text(config.get("tts_model")),
                }
            )
            if self._enabled and self._root:
                try:
                    self._root.update(
                        metadata=_root_metadata(
                            room_name=self._room_name,
                            call_context=self._call_context,
                            config=config,
                            preview_mode=self._preview_mode,
                            environment=self._env.get(
                                "LANGFUSE_ENVIRONMENT", "development"
                            ),
                            release=self._env.get("LANGFUSE_RELEASE", ""),
                        )
                    )
                except Exception as error:
                    self._log_error("update call metadata", error)
        self._record_observation(
            name="quickvoice.configuration_loading",
            as_type="span",
            metadata=metadata,
            success=success,
        )

    def record_session_startup(
        self, *, success: bool, duration_seconds: float
    ) -> None:
        self._record_observation(
            name="quickvoice.agent_session_startup",
            as_type="span",
            metadata={
                "success": success,
                "duration_ms": _duration_ms(duration_seconds),
            },
            success=success,
        )

    def record_transcript(self, item: dict[str, Any]) -> None:
        role = str(item.get("role") or "").strip().lower()
        if role == "assistant":
            role = "agent"
        if role not in {"user", "agent"}:
            return

        text = str(item.get("content", item.get("message", "")) or "")
        turn = {
            "role": role,
            "character_count": len(text),
            "non_empty": bool(text.strip()),
            "timestamp": _timestamp(item.get("time", item.get("timestamp"))),
        }
        self._turns.append(turn)
        # Stage 1 is deliberately metadata-only. Raw transcript capture remains
        # off until QuickVoice's complete privacy policy is mapped to this sink.
        self._record_observation(
            name=f"quickvoice.transcript.{role}",
            as_type="span",
            metadata=turn,
            success=True,
        )

    def record_rag(
        self,
        *,
        agent_id: str | None,
        query: str,
        top_k: int,
        context: str | None,
        success: bool,
        duration_seconds: float,
    ) -> None:
        self._rag_attempts += 1
        if success and bool(context):
            self._rag_successes += 1
        self._record_observation(
            name="quickvoice.rag_retrieval",
            as_type="retriever",
            metadata={
                "agent_id": _safe_text(agent_id),
                "top_k": int(top_k),
                "query_character_count": len(query or ""),
                "context_found": bool(context),
                "result_size": len(context or ""),
                "success": success,
                "duration_ms": _duration_ms(duration_seconds),
            },
            success=success,
        )

    def record_tool(
        self,
        *,
        tool_type: str,
        tool_name: str,
        arguments: dict[str, Any] | None,
        result: Any,
        success: bool,
        duration_seconds: float,
    ) -> None:
        self._tool_attempts += 1
        if success:
            self._tool_successes += 1
        arguments = arguments or {}
        self._record_observation(
            name=f"quickvoice.tool.{_safe_name(tool_type)}",
            as_type="tool",
            metadata={
                "tool_type": _safe_text(tool_type),
                "tool_name": _safe_text(tool_name),
                "success": success,
                "duration_ms": _duration_ms(duration_seconds),
                "argument_count": len(arguments),
                "argument_keys": ",".join(sorted(_safe_text(key) for key in arguments)),
                "argument_types": {
                    _safe_text(key): type(value).__name__ for key, value in arguments.items()
                },
                "result_type": type(result).__name__ if result is not None else "none",
                "result_size": _serialized_size(result),
            },
            success=success,
        )

    def finish(
        self,
        *,
        call_completed: bool,
        ended_normally: bool,
        call_duration_seconds: float,
    ) -> dict[str, float]:
        if self._finished:
            return dict(self._scores)
        self._finished = True
        self._scores = self._calculate_scores(
            call_completed=call_completed,
            ended_normally=ended_normally,
            call_duration_seconds=call_duration_seconds,
        )
        if not self._enabled:
            return dict(self._scores)

        try:
            self._record_observation(
                name="quickvoice.call_finalization",
                as_type="span",
                metadata={
                    "call_completed": call_completed,
                    "ended_normally": ended_normally,
                    "duration_ms": _duration_ms(call_duration_seconds),
                },
                success=call_completed,
            )
            if self._evaluation_enabled and self._trace_id:
                for name, value in self._scores.items():
                    metadata = (
                        self._quality_metadata(ended_normally)
                        if name == "conversation_quality"
                        else None
                    )
                    self._client.create_score(
                        trace_id=self._trace_id,
                        name=name,
                        value=value,
                        data_type="NUMERIC",
                        metadata=metadata,
                    )
            self._root.update(
                output={
                    "call_completed": call_completed,
                    "conversation_turns": int(self._scores["conversation_turns"]),
                }
            )
            self._root.end()
        except Exception as error:
            self._log_error("finish call", error)
        return dict(self._scores)

    def flush(self) -> None:
        if not self._client:
            return
        try:
            self._client.flush()
        except Exception as error:
            self._log_error("flush", error)

    def shutdown(self) -> None:
        if not self._client or self._shutdown:
            return
        self._shutdown = True
        try:
            self._client.shutdown()
        except Exception as error:
            self._log_error("shutdown", error)

    def _record_observation(
        self,
        *,
        name: str,
        as_type: str,
        metadata: dict[str, Any],
        success: bool,
    ) -> None:
        if not self._enabled or not self._root:
            return
        try:
            observation = self._root.start_observation(
                name=name,
                as_type=as_type,
                metadata=metadata,
                level="DEFAULT" if success else "ERROR",
            )
            observation.end()
        except Exception as error:
            self._log_error(f"record {name}", error)

    def _calculate_scores(
        self,
        *,
        call_completed: bool,
        ended_normally: bool,
        call_duration_seconds: float,
    ) -> dict[str, float]:
        user_turns = [turn for turn in self._turns if turn["role"] == "user"]
        agent_turns = [turn for turn in self._turns if turn["role"] == "agent"]
        tool_rate = (
            self._tool_successes / self._tool_attempts if self._tool_attempts else 0.0
        )
        rag_rate = self._rag_successes / self._rag_attempts if self._rag_attempts else 0.0
        return {
            "call_completed": float(call_completed),
            "has_user_input": float(bool(user_turns)),
            "has_agent_response": float(bool(agent_turns)),
            "tool_success_rate": tool_rate,
            "rag_success_rate": rag_rate,
            "conversation_turns": float(len(self._turns)),
            "call_duration_seconds": max(0.0, float(call_duration_seconds)),
            "conversation_quality": self._conversation_quality(ended_normally),
        }

    def _conversation_quality(self, ended_normally: bool) -> float:
        """Mean of response presence, length, responsiveness, tools, and ending.

        No requested tools contributes 1.0 only to the tool-completion
        component: the absence of a tool request is treated as a neutral,
        non-failing condition and does not change `tool_success_rate`.
        """
        agent_turns = [turn for turn in self._turns if turn["role"] == "agent"]
        non_empty_ratio = (
            sum(bool(turn["non_empty"]) for turn in agent_turns) / len(agent_turns)
            if agent_turns
            else 0.0
        )
        average_length = (
            sum(int(turn["character_count"]) for turn in agent_turns) / len(agent_turns)
            if agent_turns
            else 0.0
        )
        normalized_length = min(average_length / 120.0, 1.0)
        responded_after_user = float(
            any(
                turn["role"] == "agent"
                and any(previous["role"] == "user" for previous in self._turns[:index])
                for index, turn in enumerate(self._turns)
            )
        )
        tool_completion = (
            self._tool_successes / self._tool_attempts if self._tool_attempts else 1.0
        )
        return max(
            0.0,
            min(
                1.0,
                (
                    non_empty_ratio
                    + normalized_length
                    + responded_after_user
                    + tool_completion
                    + float(ended_normally)
                )
                / 5.0,
            ),
        )

    def _quality_metadata(self, ended_normally: bool) -> dict[str, Any]:
        return {
            "formula": "mean(non_empty,response_length,response_after_user,tools,normal_end)",
            "no_tools_requested": "neutral_success_for_quality_component",
            "ended_normally": ended_normally,
        }

    def _disable_after_error(self, operation: str, error: Exception) -> None:
        self._enabled = False
        self._root = None
        self._trace_id = None
        self._log_error(operation, error)

    def _log_error(self, operation: str, error: Exception) -> None:
        message = f"{type(error).__name__}: {error}"
        for key in ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"):
            configured_value = self._env.get(key, "")
            if configured_value:
                message = message.replace(configured_value, "[REDACTED]")
        logger.warning(
            "[LANGFUSE] {} failed: {}",
            operation,
            redact_sensitive(message),
        )


def _langfuse_client_factory(**kwargs: Any) -> Any:
    from langfuse import Langfuse

    return Langfuse(**kwargs)


def _env_bool(env: Mapping[str, str], key: str, default: bool) -> bool:
    value = env.get(key)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _sample_rate(value: str) -> float:
    rate = float(value)
    if not 0.0 <= rate <= 1.0:
        raise ValueError("LANGFUSE_SAMPLE_RATE must be between 0.0 and 1.0")
    return rate


def _root_metadata(
    *,
    room_name: str,
    call_context: dict[str, Any],
    config: dict[str, Any],
    preview_mode: bool,
    environment: str,
    release: str,
) -> dict[str, Any]:
    return {
        "room_name": _safe_text(room_name),
        "call_id": _safe_text(call_context.get("call_id")),
        "agent_id": _safe_text(config.get("agent_id") or call_context.get("agent_id")),
        "organization_id": _safe_text(config.get("organization_id")),
        "direction": _safe_text(call_context.get("direction")),
        "provider": _safe_text(call_context.get("provider") or config.get("provider")),
        "preview_mode": bool(preview_mode),
        "language": _safe_text(config.get("agent_language")),
        "stt_model": _safe_text(config.get("stt_model")),
        "llm_model": _safe_text(config.get("llm_model")),
        "tts_model": _safe_text(config.get("tts_model")),
        "environment": _safe_text(environment),
        "release": _safe_text(release),
        "zero_pii_retention": bool(config.get("zero_pii_retention")),
    }


def _safe_text(value: Any) -> str:
    redacted = str(redact_sensitive(str(value or "")))
    return redacted[:MAX_METADATA_TEXT_LENGTH]


def _safe_name(value: Any) -> str:
    normalized = "".join(
        character if character.isalnum() or character in "._-" else "_"
        for character in str(value or "unknown").lower()
    )
    return normalized[:64] or "unknown"


def _duration_ms(seconds: float) -> int:
    return max(0, int(float(seconds) * 1000))


def _serialized_size(value: Any) -> int:
    try:
        return len(json.dumps(value, ensure_ascii=False, default=str))
    except Exception:
        return len(str(value or ""))


def _timestamp(value: Any) -> str:
    if isinstance(value, datetime):
        timestamp = value
    elif isinstance(value, (int, float)):
        timestamp = datetime.fromtimestamp(float(value), tz=timezone.utc)
    else:
        timestamp = datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc).isoformat()
