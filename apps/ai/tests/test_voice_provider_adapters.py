import os
import sys
import unittest
from unittest.mock import patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.voice_provider_adapters import ProviderAdapterError, build_voice_provider_adapters


class VoiceProviderAdapterTests(unittest.TestCase):
    def setUp(self):
        self.config = {
            "language": "en",
            "stt": {"provider": "deepgram", "model": "nova-3"},
            "llm": {"provider": "bedrock", "model": "us.amazon.nova-micro-v1:0", "streaming": True},
            "tts": {
                "provider": "elevenlabs",
                "model": "eleven_flash_v2_5",
                "voice": "EXAVITQu4vr4xnSDxMaL",
            },
        }

    def test_build_voice_provider_adapters_requires_selected_provider_secrets(self):
        with patch.dict(
            os.environ,
            {
                "AWS_ACCESS_KEY_ID": "a",
                "AWS_SECRET_ACCESS_KEY": "s",
                "ELEVENLABS_API_KEY": "e",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(ProviderAdapterError, "DEEPGRAM_API_KEY"):
                build_voice_provider_adapters(self.config)

    def test_build_voice_provider_adapters_returns_summary(self):
        with patch.dict(
            os.environ,
            {
                "DEEPGRAM_API_KEY": "d",
                "ELEVENLABS_API_KEY": "e",
            },
            clear=True,
        ):
            adapters = build_voice_provider_adapters(self.config)

        self.assertEqual(adapters.summary["stt_provider"], "deepgram")
        self.assertEqual(adapters.summary["llm_provider"], "bedrock")
        self.assertEqual(adapters.summary["tts_provider"], "elevenlabs")

    def test_build_voice_provider_adapters_uses_deepgram_aura_2_voice_model(self):
        config = {
            **self.config,
            "tts": {
                "provider": "deepgram",
                "model": "aura-2",
                "voice": "aura-2-asteria-en",
            },
        }
        with patch.dict(os.environ, {"DEEPGRAM_API_KEY": "d"}, clear=True):
            with patch("handlers.voice_provider_adapters.deepgram.TTS") as tts:
                build_voice_provider_adapters(config)

        tts.assert_called_once_with(model="aura-2-asteria-en", api_key="d")

    def test_build_voice_provider_adapters_rejects_partial_static_aws_credentials(self):
        with patch.dict(
            os.environ,
            {
                "AWS_ACCESS_KEY_ID": "a",
                "DEEPGRAM_API_KEY": "d",
                "ELEVENLABS_API_KEY": "e",
            },
            clear=True,
        ):
            with self.assertRaisesRegex(ProviderAdapterError, "AWS_SECRET_ACCESS_KEY"):
                build_voice_provider_adapters(self.config)

    def test_multilingual_nova_3_uses_runtime_multi_language(self):
        config = {
            **self.config,
            "language": "hi",
            "stt": {
                "provider": "deepgram",
                "model": "nova-3",
                "language": "multi",
                "billing_model": "deepgram/nova-3-multilingual",
            },
        }
        with patch.dict(os.environ, {"DEEPGRAM_API_KEY": "d", "ELEVENLABS_API_KEY": "e"}, clear=True):
            with patch("handlers.voice_provider_adapters.deepgram.STT") as stt:
                build_voice_provider_adapters(config)

        stt.assert_called_once_with(model="nova-3", language="multi", api_key="d")


if __name__ == "__main__":
    unittest.main()
