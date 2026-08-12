import os

from langfuse import Langfuse
from opentelemetry.sdk.trace import TracerProvider
from livekit.agents.telemetry import set_tracer_provider


def setup_langfuse(metadata=None):
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    base_url = (
        os.getenv("LANGFUSE_BASE_URL")
        or os.getenv("LANGFUSE_HOST")
    )

    if not public_key or not secret_key or not base_url:
        raise ValueError(
            "Missing Langfuse environment variables"
        )

    tracer_provider = TracerProvider()

    set_tracer_provider(
        tracer_provider,
        metadata=metadata,
    )

    Langfuse(
        public_key=public_key,
        secret_key=secret_key,
        base_url=base_url,
        tracer_provider=tracer_provider,
        should_export_span=lambda span: True,
    )

    return tracer_provider