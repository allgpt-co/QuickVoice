import os

from langfuse import Langfuse
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.util.types import AttributeValue

from livekit.agents.telemetry import set_tracer_provider


def setup_langfuse(
    metadata: dict[str, AttributeValue] | None = None,
) -> TracerProvider:

    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    base_url = os.getenv("LANGFUSE_BASE_URL")

    if not public_key or not secret_key or not base_url:
        raise ValueError(
            "LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL must be set"
        )

    trace_provider = TracerProvider()

    set_tracer_provider(trace_provider, metadata=metadata)

    Langfuse(
        public_key=public_key,
        secret_key=secret_key,
        base_url=base_url,
        tracer_provider=trace_provider,
        should_export_span=lambda span: True,
    )
    print("✅ Langfuse initialized successfully")

    return trace_provider