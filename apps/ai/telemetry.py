"""Centralized OpenTelemetry + Langfuse telemetry initialization.

This module is the single source of truth for telemetry configuration in the
QuickVoice AI worker.  It validates environment variables, sets up the OTel
TracerProvider with a Langfuse OTLP exporter, and exposes helpers for
flushing buffered spans on shutdown.

Usage from main.py (module-level, runs at import time)::

    from telemetry import get_telemetry, flush_telemetry

    telemetry = get_telemetry()       # validated config + provider
    # ... later, on shutdown ...
    flush_telemetry(telemetry)        # best-effort span flush

The module is designed to degrade gracefully: if Langfuse credentials are
missing the TracerProvider is still created (with no exporter) so that
downstream code can unconditionally use ``opentelemetry.trace.get_tracer()``.
"""

from __future__ import annotations

import base64
import os
from dataclasses import dataclass, field
from typing import Optional

from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
    OTLPSpanExporter,
)
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter
from opentelemetry.trace import set_tracer_provider

from utils.logger import logger

_SERVICE_NAME = "quickvoice-ai"


# ---------------------------------------------------------------------------
# Configuration dataclass
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class TelemetryConfig:
    """Immutable snapshot of the resolved telemetry configuration."""

    langfuse_enabled: bool
    langfuse_base_url: str
    service_name: str
    tracer_provider: TracerProvider = field(repr=False)
    _exporter: Optional[SpanExporter] = field(default=None, repr=False)

    def __repr__(self) -> str:
        return (
            f"TelemetryConfig("
            f"langfuse_enabled={self.langfuse_enabled!r}, "
            f"langfuse_base_url={self.langfuse_base_url!r}, "
            f"service_name={self.service_name!r})"
        )


# ---------------------------------------------------------------------------
# Environment variable resolution
# ---------------------------------------------------------------------------

def _resolve_langfuse_url() -> str:
    """Return the Langfuse base URL, preferring LANGFUSE_BASE_URL."""
    return (
        os.getenv("LANGFUSE_BASE_URL")
        or os.getenv("LANGFUSE_URL")
        or "https://cloud.langfuse.com"
    )


def _validate_langfuse_env() -> dict[str, str]:
    """Validate and return Langfuse environment variables.

    Returns a dict with keys: ``public_key``, ``secret_key``, ``base_url``.
    All three are always present (empty string when not set) so callers can
    inspect values without ``KeyError``.
    """
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "").strip()
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "").strip()
    base_url = _resolve_langfuse_url()

    if public_key and secret_key:
        logger.info(
            "[TELEMETRY] Langfuse credentials found — OTLP export enabled "
            "(endpoint={}/api/public/otel/v1/traces)",
            base_url,
        )
    else:
        missing = []
        if not public_key:
            missing.append("LANGFUSE_PUBLIC_KEY")
        if not secret_key:
            missing.append("LANGFUSE_SECRET_KEY")
        logger.info(
            "[TELEMETRY] Langfuse not configured (missing: {}) — "
            "tracing will run without export. Set {} in your environment "
            "to enable Langfuse observability.",
            ", ".join(missing),
            " and ".join(missing),
        )

    return {
        "public_key": public_key,
        "secret_key": secret_key,
        "base_url": base_url,
    }


# ---------------------------------------------------------------------------
# OTel TracerProvider construction
# ---------------------------------------------------------------------------

def _build_tracer_provider(
    langfuse_creds: dict[str, str],
) -> tuple[TracerProvider, Optional[SpanExporter]]:
    """Create and configure an OTel TracerProvider.

    If Langfuse credentials are present, an ``OTLPSpanExporter`` is attached
    via a ``BatchSpanProcessor``.  Otherwise the provider is created without
    an exporter (still useful for local span creation).

    Returns ``(tracer_provider, exporter_or_none)`` so the caller can
    reference the exporter for flush / shutdown if needed.
    """
    resource = Resource.create({"service.name": _SERVICE_NAME})
    provider = TracerProvider(resource=resource)
    exporter: Optional[SpanExporter] = None

    pk = langfuse_creds["public_key"]
    sk = langfuse_creds["secret_key"]
    base_url = langfuse_creds["base_url"]

    if pk and sk:
        try:
            auth_token = base64.b64encode(f"{pk}:{sk}".encode()).decode()
            exporter = OTLPSpanExporter(
                endpoint=f"{base_url}/api/public/otel/v1/traces",
                headers={"Authorization": f"Basic {auth_token}"},
            )
            provider.add_span_processor(BatchSpanProcessor(exporter))
        except Exception as exc:
            logger.warning(
                "[TELEMETRY] Failed to create OTLP exporter: {} — "
                "tracing will run without export",
                exc,
            )
            exporter = None

    return provider, exporter


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_config: Optional[TelemetryConfig] = None


def get_telemetry() -> TelemetryConfig:
    """Return the resolved telemetry configuration, initializing on first call.

    This function is idempotent — subsequent calls return the same config.
    It must be called at module-level (import time) so the TracerProvider is
    registered before any ``get_tracer()`` calls.
    """
    global _config
    if _config is not None:
        return _config

    langfuse_creds = _validate_langfuse_env()
    provider, exporter = _build_tracer_provider(langfuse_creds)

    try:
        set_tracer_provider(provider)
    except RuntimeError:
        pass

    _config = TelemetryConfig(
        langfuse_enabled=langfuse_creds["public_key"] != ""
        and langfuse_creds["secret_key"] != "",
        langfuse_base_url=langfuse_creds["base_url"],
        service_name=_SERVICE_NAME,
        tracer_provider=provider,
        _exporter=exporter,
    )

    logger.info("[TELEMETRY] {}", _config)
    return _config


def flush_telemetry(config: Optional[TelemetryConfig] = None) -> None:
    """Best-effort flush of all pending OTel spans.

    This should be called during graceful shutdown to ensure buffered spans
    are exported before the process exits.  Errors are logged but never raised.
    """
    cfg = config or _config
    if cfg is None:
        return

    try:
        cfg.tracer_provider.force_flush(timeout_millis=5000)
    except Exception as exc:
        logger.warning("[TELEMETRY] Failed to flush tracer provider: {}", exc)


def reset_telemetry() -> None:
    """Clear the cached singleton so the next ``get_telemetry()`` call
    re-reads environment variables and creates a fresh ``TelemetryConfig``.

    For testing only.  Also resets the OTel global TracerProvider registry
    so ``set_tracer_provider`` can be called again.
    """
    global _config
    _config = None
    try:
        from opentelemetry.trace import _TRACER_PROVIDER_SET_ONCE
        _TRACER_PROVIDER_SET_ONCE._done = False
    except (ImportError, AttributeError):
        pass
