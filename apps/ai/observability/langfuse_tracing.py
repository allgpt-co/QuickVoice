import base64
import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from livekit.agents import telemetry


def setup_langfuse_tracing() -> None:
    """
    Sets up OpenTelemetry tracing with Langfuse ingestion.
    Reads environment variables, builds Basic Authentication headers,
    configures OTLPSpanExporter and BatchSpanProcessor, and registers
    the provider with LiveKit Agents telemetry.
    """
    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY")
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY")
    host = os.environ.get("LANGFUSE_HOST")

    missing = []
    if not public_key:
        missing.append("LANGFUSE_PUBLIC_KEY")
    if not secret_key:
        missing.append("LANGFUSE_SECRET_KEY")
    if not host:
        missing.append("LANGFUSE_HOST")
    if missing:
        raise ValueError(
            f"Missing required Langfuse environment variables: {', '.join(missing)}"
        )

    auth_str = f"{public_key}:{secret_key}"
    auth_bytes = auth_str.encode("utf-8")
    auth_b64 = base64.b64encode(auth_bytes).decode("utf-8")
    headers = {
        "Authorization": f"Basic {auth_b64}"
    }

    endpoint = f"{host.rstrip('/')}/api/public/otel/v1/traces"

    exporter = OTLPSpanExporter(
        endpoint=endpoint,
        headers=headers,
    )

    provider = TracerProvider()
    processor = BatchSpanProcessor(exporter)
    provider.add_span_processor(processor)

    telemetry.set_tracer_provider(provider)
    trace.set_tracer_provider(provider)
