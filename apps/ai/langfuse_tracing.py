import os

from langfuse import Langfuse
from livekit.agents.telemetry import set_tracer_provider
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.util.types import AttributeValue
from typing import Any

_langfuse: Langfuse | None = None
_tracer_provider: TracerProvider | None = None


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _get_tracer_provider() -> TracerProvider:
    global _langfuse, _tracer_provider
    if _tracer_provider is not None:
        return _tracer_provider
    tracer_provider = TracerProvider()

    _langfuse = Langfuse(
        public_key=_require_env("LANGFUSE_PUBLIC_KEY"),
        secret_key=_require_env("LANGFUSE_SECRET_KEY"),
        base_url=os.getenv("LANGFUSE_BASE_URL"),
        tracer_provider=tracer_provider,
        should_export_span=lambda span: True,
    )

    _tracer_provider = tracer_provider
    return tracer_provider


def setup_langfuse(
    *,
    session_id: str,
    metadata: dict[str, AttributeValue] | None = None
) -> TracerProvider:
    """
    Configure LiveKit to emit spans to Langfuse for the current call.
    """
    tracer_provider = _get_tracer_provider()

    session_metadata = {
        "langfuse.session.id": session_id,
    }

    if metadata:
        session_metadata.update(
            {
                key: value
                for key, value in metadata.items()
                if value is not None
            }
        )

    set_tracer_provider(
        tracer_provider,
        metadata=session_metadata,
    )

    return tracer_provider


def get_langfuse() -> Langfuse:
    """
    Returns the singleton Langfuse client.
    """
    _get_tracer_provider()
    assert _langfuse is not None
    return _langfuse
