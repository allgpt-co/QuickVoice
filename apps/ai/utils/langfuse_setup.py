import os

from langfuse import Langfuse
from livekit.agents.telemetry import set_tracer_provider
from opentelemetry.sdk.trace import TracerProvider


def setup_langfuse(metadata=None):
    trace_provider = TracerProvider()

    set_tracer_provider(
        trace_provider,
        metadata=metadata,
    )

    Langfuse(
        public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
        secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
        base_url=os.getenv("LANGFUSE_BASE_URL"),
        tracer_provider=trace_provider,
        should_export_span=lambda span: True,
    )

    return trace_provider