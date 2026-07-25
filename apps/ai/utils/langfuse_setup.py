import os
from typing import Optional

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from livekit.agents.telemetry import set_tracer_provider
from langfuse import Langfuse


def setup_langfuse() -> TracerProvider:
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    base_url = os.getenv("LANGFUSE_BASE_URL") or os.getenv("LANGFUSE_HOST")

    if not public_key or not secret_key or not base_url:
        raise ValueError(
            "LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_HOST must be set"
        )

    # Langfuse v4 sets up its own global OpenTelemetry TracerProvider internally
    Langfuse(public_key=public_key, secret_key=secret_key, base_url=base_url)

    # Point LiveKit's agent spans at that same global provider
    tracer_provider = trace.get_tracer_provider()
    set_tracer_provider(tracer_provider)

    return tracer_provider
