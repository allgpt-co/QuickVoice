import asyncio
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.config_handler import get_config, normalize_config


class ConfigHandlerTests(unittest.TestCase):
    def test_normalize_config_maps_console_fields_to_livekit_runtime_fields(self):
        config = normalize_config(
            {
                "agentId": "8d55565f-1111-4111-8111-f95fd03f0df2",
                "organizationId": "org_123",
                "userId": "user_123",
                "agentNumber": "+15551230000",
                "provider": "TWILIO",
                "firstMessage": "Hello, thanks for calling QuickVoice.",
                "systemPrompt": "You are a concise support agent.",
                "llmModel": "gpt-4o-mini",
                "sttModel": "nova-3",
                "ttsModel": "aura-2",
                "voiceId": "aura-2-asteria-en",
                "agent_language": "en",
                "use_rag": True,
                "data_needed": [{"id": "name", "name": "Name"}],
                "data_evaluation": [{"id": "tone", "name": "Tone"}],
                "post_call_webhook": {"webhook_url": "https://example.com/hook", "method": "POST"},
                "preemptive_generation": True,
                "timezone": "America/New_York",
            }
        )

        self.assertEqual(config["agent_id"], "8d55565f-1111-4111-8111-f95fd03f0df2")
        self.assertEqual(config["organization_id"], "org_123")
        self.assertEqual(config["user_id"], "user_123")
        self.assertEqual(config["agent_number"], "+15551230000")
        self.assertEqual(config["provider"], "TWILIO")
        self.assertEqual(config["first_message"], "Hello, thanks for calling QuickVoice.")
        self.assertEqual(config["system_prompt"], "You are a concise support agent.")
        self.assertEqual(config["llm_model"], "openai/gpt-4o-mini")
        self.assertEqual(config["llm_provider"], "openai")
        self.assertEqual(config["stt_model"], "deepgram/nova-3")
        self.assertEqual(config["tts_model"], "deepgram/aura-2")
        self.assertEqual(config["voice"], "asteria")
        self.assertEqual(config["agent_language"], "en-US")
        self.assertTrue(config["use_rag"])
        self.assertEqual(config["data_needed"], [{"id": "name", "name": "Name"}])
        self.assertEqual(config["data_evaluation"], [{"id": "tone", "name": "Tone"}])
        self.assertEqual(config["post_call_webhook"]["webhook_url"], "https://example.com/hook")
        self.assertTrue(config["preemptive_generation"])
        self.assertEqual(config["timezone"], "America/New_York")

    def test_normalize_config_maps_runtime_privacy_controls(self):
        config = normalize_config(
            {
                "agentId": "agent_123",
                "organizationId": "org_123",
                "store_call_audio": False,
                "zero_pii_retention": True,
                "retention_days": 7,
            }
        )

        self.assertFalse(config["store_call_audio"])
        self.assertTrue(config["zero_pii_retention"])
        self.assertEqual(config["retention_days"], 7)

    def test_normalize_config_parses_string_privacy_booleans(self):
        config = normalize_config(
            {
                "agentId": "agent_123",
                "organizationId": "org_123",
                "storeCallAudio": "false",
                "zeroPiiRetention": "true",
            }
        )

        self.assertFalse(config["store_call_audio"])
        self.assertTrue(config["zero_pii_retention"])

    def test_normalize_config_preserves_flow(self):
        flow = {
            "flowId": "flow-123",
            "compiled": {"startNodeId": "start"},
        }

        config = normalize_config({"agentId": "agent_123", "flow": flow})

        self.assertEqual(config["flow"], flow)

    def test_get_config_fetches_runtime_config_from_server_with_internal_auth(self):
        calls = []

        async def fake_get_json(url, headers):
            calls.append((url, headers))
            return {
                "success": True,
                "data": {
                    "agentId": "8d55565f-1111-4111-8111-f95fd03f0df2",
                    "organizationId": "org_123",
                    "userId": "user_123",
                    "firstMessage": "Hello from server.",
                    "systemPrompt": "Server prompt.",
                    "llmModel": "google/gemini-2.5-flash",
                    "sttModel": "universal-streaming",
                    "ttsModel": "eleven-flash-v2.5",
                    "voiceId": "aura-2-hera-en",
                    "agent_language": "en-US",
                    "provider": "TELNYX",
                },
            }

        config = asyncio.run(
            get_config(
                "8d55565f-1111-4111-8111-f95fd03f0df2",
                agent_number="+15551230000",
                server_api_url="http://server.test/api/v1",
                internal_api_key="internal-secret",
                get_json=fake_get_json,
            )
        )

        self.assertEqual(config["first_message"], "Hello from server.")
        self.assertEqual(config["system_prompt"], "Server prompt.")
        self.assertEqual(config["llm_provider"], "google")
        self.assertEqual(config["stt_model"], "assemblyai/universal-streaming")
        self.assertEqual(config["tts_model"], "elevenlabs/eleven-flash-v2.5")
        self.assertEqual(config["voice"], "aura-2-hera-en")
        self.assertEqual(config["provider"], "TELNYX")
        self.assertEqual(len(calls), 1)
        url, headers = calls[0]
        self.assertEqual(
            url,
            "http://server.test/api/v1/agents/number-config/%2B15551230000",
        )
        self.assertEqual(headers["Authorization"], "Bearer internal-secret")

    def test_get_config_fails_closed_when_runtime_backend_is_not_configured(self):
        with self.assertRaisesRegex(RuntimeError, "SERVER_API_URL and INTERNAL_API_KEY"):
            asyncio.run(
                get_config(
                    "agent_123",
                    server_api_url="",
                    internal_api_key="",
                )
            )

    def test_get_config_allows_default_config_only_in_explicit_local_dev_mode(self):
        config = asyncio.run(
            get_config(
                "agent_123",
                agent_number="+15551230000",
                server_api_url="",
                internal_api_key="",
                allow_default_config=True,
            )
        )

        self.assertEqual(config["agent_id"], "agent_123")
        self.assertEqual(config["agent_number"], "+15551230000")

    def test_get_config_fetches_runtime_config_by_agent_id_without_number(self):
        calls = []

        async def fake_get_json(url, headers):
            calls.append((url, headers))
            return {
                "success": True,
                "data": {
                    "agentId": "8d55565f-1111-4111-8111-f95fd03f0df2",
                    "organizationId": "org_123",
                    "userId": "user_123",
                    "firstMessage": "Hello from agent id.",
                    "systemPrompt": "Agent id prompt.",
                    "provider": "TWILIO",
                },
            }

        config = asyncio.run(
            get_config(
                "8d55565f-1111-4111-8111-f95fd03f0df2",
                server_api_url="http://server.test/api/v1",
                internal_api_key="internal-secret",
                get_json=fake_get_json,
            )
        )

        self.assertEqual(config["organization_id"], "org_123")
        self.assertEqual(config["first_message"], "Hello from agent id.")
        self.assertEqual(len(calls), 1)
        url, headers = calls[0]
        self.assertEqual(
            url,
            "http://server.test/api/v1/agents/internal-config/8d55565f-1111-4111-8111-f95fd03f0df2",
        )
        self.assertEqual(headers["Authorization"], "Bearer internal-secret")


if __name__ == "__main__":
    unittest.main()
