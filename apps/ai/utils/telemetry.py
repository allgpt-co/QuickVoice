"""
Langfuse tracing for the QuickVoice AI voice agent.

QuickVoice's voice pipeline runs on LiveKit Agents, which already emits
OpenTelemetry spans for the AgentSession, the LLM / STT / TTS calls, and every
tool call. Langfuse registers itself as an OpenTelemetry span processor, so the
whole integration is: build ONE TracerProvider, hand it to both LiveKit
(`set_tracer_provider`) and Langfuse, and every voice turn shows up in the
Langfuse dashboard with no change to the call logic itself.
"""

from __future__ import annotations

import os
from typing import Optional

from utils.logger import logger


def _tracing_enabled() -> bool:
    return os.getenv("LANGFUSE_TRACING_ENABLED", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def setup_langfuse_tracing(metadata: Optional[dict] = None):
    """
    Point LiveKit Agents' OpenTelemetry tracer at Langfuse. Returns the
    TracerProvider when active, else None. Never raises: observability must never
    take down a live call. Pass metadata={"langfuse.session.id": ctx.room.name}
    so all spans from one call group into a single Langfuse session.
    """
    if not _tracing_enabled():
        logger.info("[langfuse] tracing disabled via LANGFUSE_TRACING_ENABLED")
        return None

    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "").strip()
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "").strip()
    host = (
        os.getenv("LANGFUSE_HOST")
        or os.getenv("LANGFUSE_BASE_URL")
        or "https://cloud.langfuse.com"
    ).strip().rstrip("/")

    if not public_key or not secret_key:
        logger.warning("[langfuse] LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set; running untraced")
        return None

    try:
        from langfuse import Langfuse
        from opentelemetry.sdk.trace import TracerProvider

        from livekit.agents.telemetry import set_tracer_provider

        trace_provider = TracerProvider()
        set_tracer_provider(trace_provider, metadata=metadata or {})

        # Handing the shared TracerProvider to Langfuse registers its
        # LangfuseSpanProcessor on it, so every span LiveKit emits on this
        # provider is exported to Langfuse. Exporting all spans is the default
        # processor behaviour, so no per-span filter is needed here.
        Langfuse(
            public_key=public_key,
            secret_key=secret_key,
            base_url=host,
            tracer_provider=trace_provider,
        )

        logger.info("[langfuse] tracing enabled -> {}", host)
        return trace_provider
    except Exception as error:  # noqa: BLE001 - observability must never crash a call
        logger.warning("[langfuse] failed to initialize tracing: {}", error)
        return None
