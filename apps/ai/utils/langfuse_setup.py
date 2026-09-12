import os

from langfuse import Langfuse
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.util.types import AttributeValue

from livekit.agents.telemetry import set_tracer_provider


def setup_langfuse(
    metadata: dict[str, AttributeValue] | None = None,
) -> TracerProvider:

    print("\n========== LANGFUSE SETUP START ==========")

    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    base_url = os.getenv("LANGFUSE_BASE_URL") or os.getenv("LANGFUSE_HOST")

    print(f"LANGFUSE_HOST = {base_url}")
    print(f"PUBLIC KEY FOUND = {bool(public_key)}")
    print(f"SECRET KEY FOUND = {bool(secret_key)}")

    if not public_key or not secret_key or not base_url:
        raise ValueError(
            "LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL must be set."
        )

    # Create tracer provider
    tracer_provider = TracerProvider()

    # Register LiveKit telemetry
    set_tracer_provider(
        tracer_provider,
        metadata=metadata,
    )

    # Initialize Langfuse exporter
    langfuse = Langfuse(
        public_key=public_key,
        secret_key=secret_key,
        base_url=base_url,
        tracer_provider=tracer_provider,
        should_export_span=lambda span: True,
    )

    print("========== LANGFUSE INITIALIZED ==========")

    # --------------------------------------------------
    # TEMPORARY TEST SPAN
    # --------------------------------------------------
    tracer = trace.get_tracer("quickvoice-langfuse-test")

    with tracer.start_as_current_span("langfuse-test-span") as span:
        span.set_attribute("integration", "quickvoice")
        span.set_attribute("environment", "development")
        span.set_attribute("status", "success")

        print("[OK] Test span created")

    print("Flushing traces...")

    try:
        tracer_provider.force_flush()
        print("[OK] TracerProvider flushed")
    except Exception as e:
        print(f"Flush error: {e}")

    try:
        langfuse.flush()
        print("[OK] Langfuse client flushed")
    except Exception as e:
        print(f"Langfuse flush error: {e}")

    print("========== LANGFUSE SETUP COMPLETE ==========\n")

    return tracer_provider