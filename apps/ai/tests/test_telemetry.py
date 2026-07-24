"""Tests for the telemetry module (OTel + Langfuse initialization)."""

import os
import sys
import unittest
from unittest.mock import patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)


def _reset_otel_global():
    """Reset OTel global TracerProvider so set_tracer_provider can be called again."""
    from opentelemetry.trace import _TRACER_PROVIDER_SET_ONCE
    _TRACER_PROVIDER_SET_ONCE._done = False


class TelemetryEnvValidationTests(unittest.TestCase):
    """Test environment variable validation and Langfuse URL resolution."""

    def setUp(self):
        _reset_otel_global()
        from telemetry import reset_telemetry
        reset_telemetry()

    def tearDown(self):
        from telemetry import reset_telemetry
        reset_telemetry()

    @patch.dict(os.environ, {}, clear=True)
    def test_missing_credentials_logs_info(self):
        from telemetry import get_telemetry
        config = get_telemetry()
        self.assertFalse(config.langfuse_enabled)
        self.assertEqual(config.langfuse_base_url, "https://cloud.langfuse.com")

    @patch.dict(
        os.environ,
        {
            "LANGFUSE_PUBLIC_KEY": "pk-test-123",
            "LANGFUSE_SECRET_KEY": "sk-test-456",
        },
    )
    def test_valid_credentials_enables_export(self):
        from telemetry import get_telemetry
        config = get_telemetry()
        self.assertTrue(config.langfuse_enabled)
        self.assertIsNotNone(config._exporter)

    @patch.dict(
        os.environ,
        {
            "LANGFUSE_PUBLIC_KEY": "pk-test-123",
            "LANGFUSE_SECRET_KEY": "sk-test-456",
            "LANGFUSE_BASE_URL": "https://custom.langfuse.example.com",
        },
    )
    def test_custom_base_url(self):
        from telemetry import get_telemetry
        config = get_telemetry()
        self.assertEqual(
            config.langfuse_base_url, "https://custom.langfuse.example.com"
        )

    @patch.dict(
        os.environ,
        {"LANGFUSE_URL": "https://legacy.langfuse.example.com"},
    )
    def test_legacy_url_fallback(self):
        from telemetry import get_telemetry
        config = get_telemetry()
        self.assertEqual(
            config.langfuse_base_url, "https://legacy.langfuse.example.com"
        )

    @patch.dict(
        os.environ,
        {
            "LANGFUSE_PUBLIC_KEY": "pk-new",
            "LANGFUSE_SECRET_KEY": "sk-new",
            "LANGFUSE_URL": "https://legacy.example.com",
            "LANGFUSE_BASE_URL": "https://new.example.com",
        },
    )
    def test_base_url_takes_precedence_over_legacy(self):
        from telemetry import get_telemetry
        config = get_telemetry()
        self.assertEqual(config.langfuse_base_url, "https://new.example.com")

    @patch.dict(
        os.environ,
        {"LANGFUSE_PUBLIC_KEY": "pk-only"},
    )
    def test_partial_credentials_disables_export(self):
        from telemetry import get_telemetry
        config = get_telemetry()
        self.assertFalse(config.langfuse_enabled)
        self.assertIsNone(config._exporter)

    @patch.dict(
        os.environ,
        {"LANGFUSE_SECRET_KEY": "sk-only"},
    )
    def test_partial_credentials_secret_only(self):
        from telemetry import get_telemetry
        config = get_telemetry()
        self.assertFalse(config.langfuse_enabled)
        self.assertIsNone(config._exporter)

    @patch.dict(
        os.environ,
        {
            "LANGFUSE_PUBLIC_KEY": "   ",
            "LANGFUSE_SECRET_KEY": "   ",
        },
    )
    def test_whitespace_credentials_are_treated_as_empty(self):
        from telemetry import get_telemetry
        config = get_telemetry()
        self.assertFalse(config.langfuse_enabled)


class TelemetrySingletonTests(unittest.TestCase):
    """Test the singleton behavior of get_telemetry()."""

    def setUp(self):
        _reset_otel_global()
        from telemetry import reset_telemetry
        reset_telemetry()

    def tearDown(self):
        from telemetry import reset_telemetry
        reset_telemetry()

    @patch.dict(os.environ, {}, clear=True)
    def test_get_telemetry_returns_same_instance(self):
        from telemetry import get_telemetry
        first = get_telemetry()
        second = get_telemetry()
        self.assertIs(first, second)

    @patch.dict(os.environ, {}, clear=True)
    def test_reset_telemetry_returns_fresh_instance(self):
        from telemetry import get_telemetry, reset_telemetry
        first = get_telemetry()
        reset_telemetry()
        second = get_telemetry()
        self.assertIsNot(first, second)


class TelemetryFlushTests(unittest.TestCase):
    """Test flush_telemetry behavior."""

    def setUp(self):
        _reset_otel_global()
        from telemetry import reset_telemetry
        reset_telemetry()

    def tearDown(self):
        from telemetry import reset_telemetry
        reset_telemetry()

    @patch.dict(os.environ, {}, clear=True)
    def test_flush_without_config_is_noop(self):
        from telemetry import flush_telemetry
        flush_telemetry(None)

    @patch.dict(os.environ, {}, clear=True)
    def test_flush_with_config_calls_force_flush(self):
        from telemetry import get_telemetry, flush_telemetry
        config = get_telemetry()
        with patch.object(
            config.tracer_provider, "force_flush"
        ) as mock_flush:
            flush_telemetry(config)
            mock_flush.assert_called_once_with(timeout_millis=5000)

    @patch.dict(os.environ, {}, clear=True)
    def test_flush_error_is_swallowed(self):
        from telemetry import get_telemetry, flush_telemetry
        config = get_telemetry()
        with patch.object(
            config.tracer_provider,
            "force_flush",
            side_effect=RuntimeError("boom"),
        ):
            flush_telemetry(config)


class TelemetryProviderTests(unittest.TestCase):
    """Test that the TracerProvider is properly configured."""

    def setUp(self):
        _reset_otel_global()
        from telemetry import reset_telemetry
        reset_telemetry()

    def tearDown(self):
        from telemetry import reset_telemetry
        reset_telemetry()

    @patch.dict(os.environ, {}, clear=True)
    def test_tracer_provider_has_correct_service_name(self):
        from telemetry import get_telemetry
        config = get_telemetry()
        resource = config.tracer_provider.resource
        self.assertEqual(
            resource.attributes.get("service.name"), "quickvoice-ai"
        )

    @patch.dict(os.environ, {}, clear=True)
    def test_tracer_provider_is_set_as_global(self):
        from opentelemetry.trace import get_tracer_provider
        from telemetry import get_telemetry
        config = get_telemetry()
        global_provider = get_tracer_provider()
        self.assertIs(global_provider, config.tracer_provider)

    @patch.dict(
        os.environ,
        {
            "LANGFUSE_PUBLIC_KEY": "pk-test",
            "LANGFUSE_SECRET_KEY": "sk-test",
        },
    )
    def test_exporter_attached_when_credentials_present(self):
        from telemetry import get_telemetry
        config = get_telemetry()
        self.assertIsNotNone(config._exporter)
        self.assertGreater(
            len(config.tracer_provider._active_span_processor._span_processors), 0
        )


class LangfuseHelperTests(unittest.TestCase):
    """Test the Langfuse client helper."""

    def test_returns_none_when_credentials_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            from langfuse_helper import get_langfuse_client
            result = get_langfuse_client()
            self.assertIsNone(result)

    def test_returns_none_when_only_public_key_set(self):
        with patch.dict(
            os.environ, {"LANGFUSE_PUBLIC_KEY": "pk-test"}, clear=True
        ):
            from langfuse_helper import get_langfuse_client
            result = get_langfuse_client()
            self.assertIsNone(result)

    @patch.dict(
        os.environ,
        {
            "LANGFUSE_PUBLIC_KEY": "pk-test",
            "LANGFUSE_SECRET_KEY": "sk-test",
            "LANGFUSE_BASE_URL": "https://custom.example.com",
        },
    )
    @patch("langfuse_helper.Langfuse")
    def test_creates_client_with_correct_params(self, mock_langfuse_cls):
        from langfuse_helper import get_langfuse_client
        result = get_langfuse_client()
        mock_langfuse_cls.assert_called_once_with(
            public_key="pk-test",
            secret_key="sk-test",
            host="https://custom.example.com",
        )
        self.assertIsNotNone(result)

    @patch.dict(
        os.environ,
        {
            "LANGFUSE_PUBLIC_KEY": "pk-test",
            "LANGFUSE_SECRET_KEY": "sk-test",
        },
    )
    @patch("langfuse_helper.Langfuse")
    def test_defaults_to_cloud_url(self, mock_langfuse_cls):
        from langfuse_helper import get_langfuse_client
        get_langfuse_client()
        mock_langfuse_cls.assert_called_once_with(
            public_key="pk-test",
            secret_key="sk-test",
            host="https://cloud.langfuse.com",
        )


if __name__ == "__main__":
    unittest.main()
