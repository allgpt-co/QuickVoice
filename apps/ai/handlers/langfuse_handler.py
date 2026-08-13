"""
Langfuse observability integration for QuickVoice voice agents.

This module provides tracing and evaluation capabilities using the Langfuse
platform (SDK v4). Each voice call becomes a Langfuse trace with observations for:
- LLM generation (system prompt, user turns, assistant responses)
- STT transcription events
- TTS synthesis events
- Tool calls (RAG, HTTP tools, MCP tools)
- Call metadata and evaluations

Environment variables:
    LANGFUSE_SECRET_KEY: Langfuse secret key
    LANGFUSE_PUBLIC_KEY: Langfuse public key
    LANGFUSE_HOST: Langfuse server URL (defaults to https://cloud.langfuse.com)
    LANGFUSE_ENABLED: Set to "true" to enable tracing (defaults to "false")
"""

from __future__ import annotations

import os
import time
from typing import Any

from utils.logger import logger

_ENABLED = os.getenv("LANGFUSE_ENABLED", "false").lower() in {"1", "true", "yes"}

_langfuse_client = None


def _get_langfuse():
    """Lazy-initialize the Langfuse client singleton."""
    global _langfuse_client
    if _langfuse_client is not None:
        return _langfuse_client

    try:
        from langfuse import Langfuse

        _langfuse_client = Langfuse(
            secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
            public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
            host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
        )
        logger.info("[LANGFUSE] Client initialized successfully")
        return _langfuse_client
    except Exception as exc:
        logger.warning("[LANGFUSE] Failed to initialize client: {}", str(exc))
        return None


def is_enabled() -> bool:
    """Check if Langfuse tracing is enabled."""
    return _ENABLED


class CallTrace:
    """
    Wraps a Langfuse trace for a single voice call session using SDK v4 API.

    Each voice call gets a root observation with child observations for each
    event (user turns, agent turns, LLM calls, tool calls, etc.).

    Usage:
        trace = CallTrace.start(call_context, config)
        trace.span_user_turn(text)
        trace.span_agent_turn(text)
        trace.span_llm_generation(prompt, completion, model)
        trace.span_tool_call(tool_name, input_data, output_data, duration_ms)
        trace.end()
    """

    def __init__(self, root_span, propagate_ctx, call_context: dict, config: dict):
        self._root_span = root_span
        self._propagate_ctx = propagate_ctx
        self._call_context = call_context
        self._config = config
        self._start_time = time.time()

    @classmethod
    def start(cls, call_context: dict, config: dict) -> "CallTrace":
        """
        Start a new Langfuse trace for a voice call.

        Args:
            call_context: Call context dict (agent_id, room_name, direction, etc.)
            config: Agent config dict
        """
        if not is_enabled():
            return _NoOpCallTrace()

        langfuse = _get_langfuse()
        if langfuse is None:
            return _NoOpCallTrace()

        agent_id = call_context.get("agent_id") or config.get("agent_id") or "unknown"
        room_name = call_context.get("room_name", "unknown")

        try:
            from langfuse import propagate_attributes

            # Set trace-level attributes via propagate_attributes context manager
            ctx = propagate_attributes(
                trace_name=f"voice-call-{agent_id}",
                user_id=call_context.get("caller_number") or call_context.get("user_id"),
                session_id=room_name,
                tags=["voice-agent", f"agent:{agent_id}"],
                metadata={
                    "agent_id": agent_id,
                    "direction": str(call_context.get("direction", "")),
                    "room_name": room_name,
                    "provider": str(call_context.get("provider", "")),
                    "llm_model": str(config.get("llm_model", "")),
                    "stt_model": str(config.get("stt_model", "")),
                    "tts_model": str(config.get("tts_model", "")),
                    "agent_language": str(config.get("agent_language", "en-US")),
                },
            )
            ctx.__enter__()

            # Create root observation for this call
            root_span = langfuse.start_observation(
                name=f"voice-call-{agent_id}",
                input={
                    "agent_id": agent_id,
                    "direction": call_context.get("direction"),
                    "room_name": room_name,
                },
            )
            logger.info("[LANGFUSE] Trace started for room={}", room_name)
            return cls(root_span, ctx, call_context, config)
        except Exception as exc:
            logger.warning("[LANGFUSE] Failed to start trace: {}", str(exc))
            return _NoOpCallTrace()

    def span_llm_generation(
        self,
        prompt: str | list[dict],
        completion: str,
        model: str | None = None,
        duration_ms: float | None = None,
        usage: dict | None = None,
    ) -> None:
        """Record an LLM generation observation."""
        try:
            metadata = {}
            if duration_ms:
                metadata["duration_ms"] = str(duration_ms)
            if usage:
                metadata.update({k: str(v) for k, v in usage.items()})

            gen = self._root_span.start_observation(
                name="llm-generation",
                as_type="generation",
                model=model or self._config.get("llm_model", "unknown"),
                input=prompt,
                output=completion,
                metadata=metadata or None,
            )
            gen.end()
        except Exception as exc:
            logger.debug("[LANGFUSE] Failed to record LLM generation: {}", str(exc))

    def span_stt(
        self,
        transcript: str,
        model: str | None = None,
        duration_ms: float | None = None,
        language: str | None = None,
    ) -> None:
        """Record an STT transcription observation."""
        try:
            span = self._root_span.start_observation(
                name="stt-transcription",
                input={"audio_duration_ms": duration_ms},
                output=transcript,
                metadata={
                    "model": str(model or self._config.get("stt_model", "unknown")),
                    "language": str(language or self._config.get("agent_language", "en-US")),
                    "duration_ms": str(duration_ms or ""),
                },
            )
            span.end()
        except Exception as exc:
            logger.debug("[LANGFUSE] Failed to record STT span: {}", str(exc))

    def span_tts(
        self,
        text: str,
        model: str | None = None,
        duration_ms: float | None = None,
        voice: str | None = None,
    ) -> None:
        """Record a TTS synthesis observation."""
        try:
            span = self._root_span.start_observation(
                name="tts-synthesis",
                input=text,
                metadata={
                    "model": str(model or self._config.get("tts_model", "unknown")),
                    "voice": str(voice or self._config.get("voice", "")),
                    "duration_ms": str(duration_ms or ""),
                },
            )
            span.end()
        except Exception as exc:
            logger.debug("[LANGFUSE] Failed to record TTS span: {}", str(exc))

    def span_tool_call(
        self,
        tool_name: str,
        input_data: Any = None,
        output_data: Any = None,
        duration_ms: float | None = None,
        status: str = "success",
    ) -> None:
        """Record a tool call observation (RAG, HTTP tool, MCP tool, etc.)."""
        try:
            span = self._root_span.start_observation(
                name=f"tool-{tool_name}",
                input=input_data,
                output=output_data,
                metadata={
                    "tool_name": tool_name,
                    "duration_ms": str(duration_ms or ""),
                    "status": status,
                },
            )
            span.end()
        except Exception as exc:
            logger.debug("[LANGFUSE] Failed to record tool call span: {}", str(exc))

    def span_user_turn(self, text: str) -> None:
        """Record a user speech turn."""
        try:
            span = self._root_span.start_observation(
                name="user-turn",
                input=text,
                metadata={"type": "user_speech"},
            )
            span.end()
        except Exception as exc:
            logger.debug("[LANGFUSE] Failed to record user turn: {}", str(exc))

    def span_agent_turn(self, text: str) -> None:
        """Record an agent speech turn."""
        try:
            span = self._root_span.start_observation(
                name="agent-turn",
                output=text,
                metadata={"type": "agent_speech"},
            )
            span.end()
        except Exception as exc:
            logger.debug("[LANGFUSE] Failed to record agent turn: {}", str(exc))

    def score(
        self,
        name: str,
        value: float | str,
        comment: str | None = None,
    ) -> None:
        """
        Add an evaluation score to the trace.

        Args:
            name: Score name (e.g. "call_quality", "task_completion")
            value: Numeric score (0-1) or categorical string
            comment: Optional explanation
        """
        try:
            langfuse = _get_langfuse()
            if langfuse:
                langfuse.api.scores.create(
                    name=name,
                    value=value,
                    comment=comment,
                )
            logger.debug("[LANGFUSE] Score recorded: {}={}", name, value)
        except Exception as exc:
            logger.debug("[LANGFUSE] Failed to record score: {}", str(exc))

    def end(self, status: str = "completed") -> None:
        """Finalize the trace and flush to Langfuse."""
        try:
            duration_s = time.time() - self._start_time
            self._root_span.update(
                output={
                    "call_duration_seconds": round(duration_s, 2),
                    "status": status,
                },
            )
            self._root_span.end()

            # Exit the propagate_attributes context manager
            if self._propagate_ctx:
                try:
                    self._propagate_ctx.__exit__(None, None, None)
                except Exception:
                    pass

            # Flush to ensure all events are sent
            langfuse = _get_langfuse()
            if langfuse:
                langfuse.flush()
            logger.info("[LANGFUSE] Trace ended (duration={:.1f}s, status={})", duration_s, status)
        except Exception as exc:
            logger.warning("[LANGFUSE] Failed to end trace: {}", str(exc))


class _NoOpCallTrace(CallTrace):
    """No-op implementation when Langfuse is disabled or unavailable."""

    def __init__(self):
        self._start_time = time.time()

    def span_llm_generation(self, *args, **kwargs) -> None:
        pass

    def span_stt(self, *args, **kwargs) -> None:
        pass

    def span_tts(self, *args, **kwargs) -> None:
        pass

    def span_tool_call(self, *args, **kwargs) -> None:
        pass

    def span_user_turn(self, *args, **kwargs) -> None:
        pass

    def span_agent_turn(self, *args, **kwargs) -> None:
        pass

    def score(self, *args, **kwargs) -> None:
        pass

    def end(self, status: str = "completed") -> None:
        pass


def shutdown() -> None:
    """Flush any pending events and shut down the Langfuse client."""
    global _langfuse_client
    if _langfuse_client is not None:
        try:
            _langfuse_client.flush()
            _langfuse_client.shutdown()
            logger.info("[LANGFUSE] Client shut down cleanly")
        except Exception as exc:
            logger.warning("[LANGFUSE] Error during shutdown: {}", str(exc))
        finally:
            _langfuse_client = None
