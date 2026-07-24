import base64
import os
from typing import Any

from utils.logger import logger


DEFAULT_LANGFUSE_BASE_URL = "https://cloud.langfuse.com"


def build_langfuse_metadata(
    *,
    room_name: str,
    call_context: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, str]:
    """Build non-sensitive attributes shared by every LiveKit trace span."""
    metadata = {
        "langfuse.session.id": room_name,
        "langfuse.trace.name": "quickvoice-call",
        "quickvoice.call.id": str(call_context.get("call_id") or room_name),
        "quickvoice.room.name": room_name,
    }
    for key, value in {
        "quickvoice.agent.id": call_context.get("agent_id") or config.get("agent_id"),
        "quickvoice.llm.provider": _llm_value(config, "provider"),
        "quickvoice.llm.model": _llm_value(config, "model"),
    }.items():
        if value:
            metadata[key] = str(value)
    return metadata


def setup_langfuse(metadata: dict[str, str], *, environ: dict[str, str] | None = None):
    """Route LiveKit OpenTelemetry spans to Langfuse when credentials are configured."""
    environment = environ if environ is not None else os.environ
    public_key = environment.get("LANGFUSE_PUBLIC_KEY")
    secret_key = environment.get("LANGFUSE_SECRET_KEY")
    if not public_key or not secret_key:
        logger.info("[LANGFUSE] tracing disabled: credentials are not configured")
        return None

    base_url = environment.get("LANGFUSE_BASE_URL", DEFAULT_LANGFUSE_BASE_URL).rstrip("/")
    try:
        from livekit.agents.telemetry import set_tracer_provider
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        auth = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
        provider = TracerProvider()
        provider.add_span_processor(
            BatchSpanProcessor(
                OTLPSpanExporter(
                    endpoint=f"{base_url}/api/public/otel/v1/traces",
                    headers={
                        "Authorization": f"Basic {auth}",
                        "x-langfuse-ingestion-version": "4",
                    },
                )
            )
        )
        set_tracer_provider(provider, metadata=metadata)
        logger.info("[LANGFUSE] tracing enabled")
        return provider
    except Exception as error:
        logger.warning("[LANGFUSE] tracing disabled: setup failed: {}", str(error))
        return None


def flush_langfuse(provider) -> None:
    if provider is None:
        return
    try:
        provider.force_flush()
    except Exception as error:
        logger.warning("[LANGFUSE] failed to flush traces: {}", str(error))


def _llm_value(config: dict[str, Any], key: str) -> Any:
    voice_config = config.get("voice_config")
    if isinstance(voice_config, dict) and isinstance(voice_config.get("llm"), dict):
        return voice_config["llm"].get(key)
    if key == "provider":
        return config.get("llm_provider")
    return config.get("llm_model")
