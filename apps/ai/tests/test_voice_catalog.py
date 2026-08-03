import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.voice_catalog import load_voice_catalog


class VoiceCatalogTests(unittest.TestCase):
    def test_load_voice_catalog_returns_static_provider_options(self):
        catalog = load_voice_catalog()

        self.assertEqual(catalog["version"], "2026-08-01")
        self.assertTrue(any(item["provider"] == "deepgram" for item in catalog["stt_models"]))
        self.assertTrue(any(item["provider"] == "bedrock" for item in catalog["llm_models"]))
        self.assertTrue(
            any(
                item["id"] == "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
                and item["label"] == "Claude Sonnet 4.5"
                for item in catalog["llm_models"]
            )
        )
        self.assertTrue(any(item["provider"] == "elevenlabs" for item in catalog["tts_models"]))
        self.assertTrue(
            any(
                item["provider"] == "deepgram"
                and item["id"] == "aura-2"
                and item["label"] == "Deepgram Aura-2"
                for item in catalog["tts_models"]
            )
        )
        self.assertTrue(
            any(
                item["provider"] == "deepgram"
                and item["id"] == "aura-2-asteria-en"
                and item["runtime_voice"] == "aura-2-asteria-en"
                and "aura-2" in item["tts_models"]
                for item in catalog["voices"]
            )
        )
        self.assertTrue(any(item["provider"] == "sarvam" for item in catalog["voices"]))
        self.assertTrue(
            any(
                item["id"] == "nova-3-multilingual"
                and item["runtime_model"] == "nova-3"
                and item["runtime_language"] == "multi"
                for item in catalog["stt_models"]
            )
        )

    def test_load_voice_catalog_prefers_configured_json_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "catalog.json"
            path.write_text(json.dumps({"version": "custom", "defaults": {}, "languages": []}))

            with patch.dict(os.environ, {"VOICE_CATALOG_PATH": str(path)}, clear=False):
                catalog = load_voice_catalog()

        self.assertEqual(catalog["version"], "custom")


if __name__ == "__main__":
    unittest.main()
