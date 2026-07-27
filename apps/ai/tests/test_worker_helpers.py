import os
import sys
import unittest
import asyncio

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.worker_handler import (
    PREVIEW_TRANSCRIPT_TOPIC,
    apply_initiation_webhook_metadata,
    apply_metadata_overrides,
    build_call_context,
    parse_metadata,
    parse_preview_user_transcript_packet,
    consume_preview_user_transcript_stream,
    resolve_webhook_dynamic_variables,
    speak_first_message,
    value_at_json_path,
    webhook_body_values,
)
from livekit.agents import room_io

from main import (
    Assistant,
    attach_resolved_voice_config,
    build_agent_instructions,
    build_room_options,
    build_session_provider_kwargs,
    provider_section,
)


class WorkerHandlerTests(unittest.TestCase):
    def test_build_agent_instructions_mentions_livekit_dtmf_tool_when_ivr_navigation_enabled(self):
        instructions = build_agent_instructions({"ivr_navigation_enabled": True})

        self.assertIn("IVR navigation", instructions)
        self.assertIn("send_dtmf_events", instructions)
        self.assertIn("outbound calls", instructions)
        self.assertIn("remember it while you listen", instructions)
        self.assertIn("match that goal to the menu option", instructions)
        self.assertIn("Do not ask the human to press the key", instructions)

    def test_assistant_exposes_livekit_dtmf_tool_when_ivr_navigation_enabled(self):
        agent = Assistant(
            system_prompt="Use available tools.",
            config={"ivr_navigation_enabled": True},
            call_context={"direction": "outbound"},
        )

        self.assertIn("send_dtmf_events", [tool.id for tool in agent.tools])

    def test_assistant_exposes_livekit_dtmf_tool_for_outbound_calls_by_default(self):
        agent = Assistant(
            system_prompt="Use available tools.",
            config={},
            call_context={"direction": "outbound"},
        )

        self.assertIn("send_dtmf_events", [tool.id for tool in agent.tools])

    def test_assistant_keeps_livekit_dtmf_tool_off_when_ivr_navigation_disabled(self):
        agent = Assistant(
            system_prompt="Use available tools.",
            config={"ivr_navigation_enabled": False},
            call_context={"direction": "outbound"},
        )

        self.assertNotIn("send_dtmf_events", [tool.id for tool in agent.tools])

    def test_provider_section_parses_supported_provider_model_values(self):
        self.assertEqual(provider_section("deepgram/nova-3"), {"provider": "deepgram", "model": "nova-3"})
        self.assertEqual(provider_section("bedrock/us.amazon.nova-micro-v1:0"), {"provider": "bedrock", "model": "us.amazon.nova-micro-v1:0"})
        self.assertIsNone(provider_section("google/gemini-2.5-flash"))

    def test_attach_resolved_voice_config_resolves_deepgram_aura_2(self):
        config = attach_resolved_voice_config(
            {
                "agent_language": "en-US",
                "stt_model": "deepgram/nova-3",
                "llm_model": "bedrock/us.amazon.nova-micro-v1:0",
                "tts_model": "deepgram/aura-2",
                "voice": "asteria",
            }
        )

        self.assertEqual(config["voice_config"]["tts"], {
            "provider": "deepgram",
            "model": "aura-2",
            "voice": "aura-2-asteria-en",
        })

    def test_build_session_provider_kwargs_uses_existing_inference_without_voice_config(self):
        from unittest.mock import patch

        with patch.dict(
            os.environ,
            {
                "LIVEKIT_API_KEY": "test-key",
                "LIVEKIT_API_SECRET": "test-livekit-secret-at-least-32-bytes",
            },
            clear=False,
        ):
            kwargs = build_session_provider_kwargs(
                {
                    "agent_language": "en-US",
                    "stt_model": "deepgram/nova-3",
                    "llm_model": "google/gemini-2.5-flash",
                    "llm_provider": "google",
                    "tts_model": "deepgram/aura-2",
                    "voice": "aura-2-asteria-en",
                }
            )

        self.assertEqual(set(kwargs.keys()), {"stt", "llm", "tts"})

    def test_build_room_options_emits_text_before_audio_sync_and_keeps_noise_filter_off_by_default(self):
        from unittest.mock import patch

        with patch.dict(os.environ, {}, clear=True):
            options = build_room_options()

        self.assertIsInstance(options.text_output, room_io.TextOutputOptions)
        self.assertIs(options.text_output.sync_transcription, False)
        self.assertIsInstance(options.audio_input, room_io.AudioInputOptions)
        self.assertIsNone(options.audio_input.noise_cancellation)

    def test_build_room_options_can_enable_livekit_noise_filter(self):
        from unittest.mock import patch

        with patch.dict(os.environ, {"LIVEKIT_ENABLE_NOISE_CANCELLATION": "true"}, clear=True):
            options = build_room_options()

        self.assertTrue(callable(options.audio_input.noise_cancellation))

    def test_parse_metadata_returns_empty_dict_for_missing_or_bad_json(self):
        self.assertEqual(parse_metadata(""), {})
        self.assertEqual(parse_metadata("not-json"), {})

    def test_build_call_context_defaults_inbound_from_livekit_room_name(self):
        context = build_call_context(
            room_name="+15551230000_+15550001111",
            metadata={"agent_id": "8d55565f-1111-4111-8111-f95fd03f0df2"},
        )

        self.assertEqual(context["agent_id"], "8d55565f-1111-4111-8111-f95fd03f0df2")
        self.assertEqual(context["agent_number"], "+15551230000")
        self.assertEqual(context["user_number"], "+15550001111")
        self.assertEqual(context["direction"], "inbound")
        self.assertEqual(context["from_number"], "+15550001111")
        self.assertEqual(context["to_number"], "+15551230000")
        self.assertEqual(context["call_id"], "+15551230000_+15550001111")

    def test_build_call_context_uses_livekit_sip_attributes_for_inbound_numbers(self):
        context = build_call_context(
            room_name="call-_+918877645613_ASBJ52Wjd7uk",
            metadata={
                "agentId": "8d55565f-1111-4111-8111-f95fd03f0df2",
                "sip.phoneNumber": "+918877645613",
                "sip.trunkPhoneNumber": "+18005550100",
                "sip.callID": "sip-call-123",
            },
        )

        self.assertEqual(context["agent_id"], "8d55565f-1111-4111-8111-f95fd03f0df2")
        self.assertEqual(context["agent_number"], "+18005550100")
        self.assertEqual(context["user_number"], "+918877645613")
        self.assertEqual(context["from_number"], "+918877645613")
        self.assertEqual(context["to_number"], "+18005550100")
        self.assertEqual(context["call_id"], "sip-call-123")

    def test_build_call_context_uses_outbound_metadata_numbers_when_present(self):
        context = build_call_context(
            room_name="outbound-room",
            metadata={
                "agent_id": "8d55565f-1111-4111-8111-f95fd03f0df2",
                "direction": "outbound",
                "from_number": "+15551230000",
                "to_number": "+15550001111",
                "outbound_id": "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113",
            },
        )

        self.assertEqual(context["direction"], "outbound")
        self.assertEqual(context["agent_number"], "+15551230000")
        self.assertEqual(context["user_number"], "+15550001111")
        self.assertEqual(context["from_number"], "+15551230000")
        self.assertEqual(context["to_number"], "+15550001111")
        self.assertEqual(context["outbound_id"], "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113")

    def test_build_call_context_keeps_web_widget_room_out_of_phone_fields(self):
        context = build_call_context(
            room_name="widget_wgs_123",
            metadata={
                "source": "web_widget",
                "agent_id": "agent_123",
                "call_id": "widget_wgs_123",
                "provider": "WEB_WIDGET",
            },
        )

        self.assertEqual(context["direction"], "inbound")
        self.assertEqual(context["call_id"], "widget_wgs_123")
        self.assertIsNone(context["agent_number"])
        self.assertIsNone(context["user_number"])
        self.assertIsNone(context["from_number"])
        self.assertIsNone(context["to_number"])
        self.assertEqual(context["metadata"]["source"], "web_widget")

    def test_build_call_context_preserves_non_routing_metadata(self):
        context = build_call_context(
            room_name="outbound-room",
            metadata={
                "agent_id": "8d55565f-1111-4111-8111-f95fd03f0df2",
                "direction": "outbound",
                "from_number": "+15551230000",
                "to_number": "+15550001111",
                "campaign_id": "campaign_123",
                "leadSource": "website",
                "system_prompt": "Do not store this prompt as call metadata",
            },
        )

        self.assertEqual(
            context["metadata"],
            {"campaign_id": "campaign_123", "leadSource": "website"},
        )

    def test_speak_first_message_sends_configured_message_to_livekit_session(self):
        class FakeSession:
            def __init__(self):
                self.calls = []

            def say(self, text, **kwargs):
                self.calls.append((text, kwargs))
                return "speech-handle"

        session = FakeSession()
        result = speak_first_message(session, {"first_message": "Hello caller."})

        self.assertEqual(result, "speech-handle")
        self.assertEqual(session.calls, [("Hello caller.", {"allow_interruptions": True})])

    def test_parse_preview_user_transcript_packet_accepts_preview_user_text(self):
        text = parse_preview_user_transcript_packet(
            b'{"type":"preview_user_transcript","text":" hello agent "}',
            topic=PREVIEW_TRANSCRIPT_TOPIC,
            participant_identity="preview-user-abc123",
            preview_mode=True,
        )

        self.assertEqual(text, "hello agent")

    def test_parse_preview_user_transcript_packet_rejects_non_preview_packets(self):
        self.assertIsNone(
            parse_preview_user_transcript_packet(
                b'{"type":"preview_user_transcript","text":"hello"}',
                topic=PREVIEW_TRANSCRIPT_TOPIC,
                participant_identity="preview-user-abc123",
                preview_mode=False,
            )
        )
        self.assertIsNone(
            parse_preview_user_transcript_packet(
                b'{"type":"preview_user_transcript","text":"hello"}',
                topic="chat",
                participant_identity="preview-user-abc123",
                preview_mode=True,
            )
        )
        self.assertIsNone(
            parse_preview_user_transcript_packet(
                b'{"type":"preview_user_transcript","text":"hello"}',
                topic=PREVIEW_TRANSCRIPT_TOPIC,
                participant_identity="agent-abc123",
                preview_mode=True,
            )
        )

    def test_consume_preview_user_transcript_stream_generates_reply(self):
        class FakeTextStreamReader:
            async def read_all(self):
                return '{"type":"preview_user_transcript","text":" hello from browser "}'

        replies = []

        asyncio.run(
            consume_preview_user_transcript_stream(
                FakeTextStreamReader(),
                participant_identity="preview-user-abc123",
                preview_mode=True,
                generate_reply=replies.append,
            )
        )

        self.assertEqual(replies, ["hello from browser"])

    def test_apply_metadata_overrides_uses_outbound_prompt_and_first_message(self):
        config = {
            "first_message": "Default greeting.",
            "system_prompt": "Default prompt.",
            "provider": "TWILIO",
        }

        result = apply_metadata_overrides(
            config,
            {
                "direction": "outbound",
                "first_message": "Quick outbound hello.",
                "system_prompt": "Keep this outbound call short.",
            },
        )

        self.assertEqual(result["first_message"], "Quick outbound hello.")
        self.assertEqual(result["system_prompt"], "Keep this outbound call short.")
        self.assertEqual(config["first_message"], "Default greeting.")

    def test_apply_metadata_overrides_uses_preview_prompt_and_first_message(self):
        config = {
            "first_message": "Default greeting.",
            "system_prompt": "Default prompt.",
            "provider": "TWILIO",
        }

        result = apply_metadata_overrides(
            config,
            {
                "mode": "preview",
                "first_message": "Preview hello.",
                "system_prompt": "Use the saved agent behavior in preview.",
            },
        )

        self.assertEqual(result["first_message"], "Preview hello.")
        self.assertEqual(result["system_prompt"], "Use the saved agent behavior in preview.")
        self.assertEqual(config["first_message"], "Default greeting.")

    def test_apply_metadata_overrides_uses_widget_prompt_and_first_message(self):
        config = {
            "first_message": "Default greeting.",
            "system_prompt": "Default prompt.",
            "provider": "WEB_WIDGET",
        }

        result = apply_metadata_overrides(
            config,
            {
                "mode": "widget",
                "first_message": "Website hello.",
                "system_prompt": "Help the website visitor.",
            },
        )

        self.assertEqual(result["first_message"], "Website hello.")
        self.assertEqual(result["system_prompt"], "Help the website visitor.")

    def test_apply_metadata_overrides_uses_batch_language_voice_and_dynamic_variables(self):
        config = {
            "first_message": "Hi {{city}} customer.",
            "system_prompt": "Ask about {{other_dyn_variable}}.",
            "agent_language": "en-US",
            "voice": "aura-2-asteria-en",
        }

        result = apply_metadata_overrides(
            config,
            {
                "direction": "outbound",
                "language": "hi-IN",
                "voice_id": "aura-2-athena-en",
                "dynamic_variables": {
                    "city": "Mumbai",
                    "other_dyn_variable": "renewal",
                },
            },
        )

        self.assertEqual(result["agent_language"], "hi-IN")
        self.assertEqual(result["voice"], "aura-2-athena-en")
        self.assertEqual(result["first_message"], "Hi Mumbai customer.")
        self.assertEqual(result["system_prompt"], "Ask about renewal.")
        self.assertEqual(
            result["dynamic_variables"],
            {
                "city": "Mumbai",
                "other_dyn_variable": "renewal",
            },
        )
        self.assertEqual(config["first_message"], "Hi {{city}} customer.")

    def test_apply_initiation_webhook_metadata_resolves_mapped_paths_before_call_values(self):
        async def fake_fetch(webhook, metadata, call_context):
            return {
                "customer": {"city": "Webhook City"},
                "account": {"tier": "Gold"},
                "dynamic_variables": {"plan": "Webhook Plan"},
            }

        result = asyncio.run(
            apply_initiation_webhook_metadata(
                {
                    "initiation_webhook": {
                        "webhook_url": "https://example.com/init",
                        "method": "POST",
                        "dynamic_variables": {
                            "city": "customer.city",
                            "tier": "account.tier",
                            "missing": "account.missing",
                        },
                    }
                },
                {
                    "direction": "outbound",
                    "dynamic_variables": {
                        "city": "Call City",
                    },
                },
                {"call_id": "call_123"},
                fetch_json=fake_fetch,
            )
        )

        self.assertEqual(
            result["dynamic_variables"],
            {
                "city": "Call City",
                "tier": "Gold",
            },
        )

    def test_resolve_webhook_dynamic_variables_supports_json_paths(self):
        payload = {
            "customer": {"name": "Avery"},
            "items": [{"total": 125.4}],
            "account.balance_due": "legacy-flat-key",
        }

        self.assertEqual(value_at_json_path(payload, "customer.name"), "Avery")
        self.assertEqual(value_at_json_path(payload, "$.items[0].total"), 125.4)
        self.assertEqual(value_at_json_path(payload, "account.balance_due"), "legacy-flat-key")
        self.assertEqual(
            resolve_webhook_dynamic_variables(
                payload,
                {
                    "customer_name": "customer.name",
                    "balance_due": "$.items[0].total",
                    "missing": "items[1].total",
                },
            ),
            {
                "customer_name": "Avery",
                "balance_due": 125.4,
            },
        )
        self.assertEqual(
            webhook_body_values(
                {
                    "tenant": {"value": "acme", "type": "Value"},
                    "empty": {"value": "", "type": "Value"},
                    "plain": "kept",
                }
            ),
            {"tenant": "acme", "plain": "kept"},
        )

    def test_apply_metadata_overrides_uses_placeholders_as_dynamic_variable_fallbacks(self):
        config = {
            "first_message": "Hi {{ city }} {{name}}.",
            "system_prompt": "Plan {{plan}} for {{missing}}.",
            "variables": {
                "firstMessage": ["city", "name"],
                "systemPrompt": ["plan", "missing"],
                "placeholders": {
                    "city": "Dallas",
                    "plan": "Starter",
                },
            },
        }

        result = apply_metadata_overrides(
            config,
            {
                "direction": "outbound",
                "dynamic_variables": {
                    "city": "Austin",
                    "name": "Ada",
                },
            },
        )

        self.assertEqual(result["first_message"], "Hi Austin Ada.")
        self.assertEqual(result["system_prompt"], "Plan Starter for {{missing}}.")

    def test_apply_metadata_overrides_renders_inbound_dynamic_variables(self):
        config = {
            "first_message": "Hi {{name}}.",
            "system_prompt": "Use {{plan}}.",
            "variables": {
                "firstMessage": ["name"],
                "systemPrompt": ["plan"],
                "placeholders": {
                    "name": "Fallback Name",
                    "plan": "Starter",
                },
            },
        }

        result = apply_metadata_overrides(
            config,
            {
                "direction": "inbound",
                "first_message": "Override {{name}}.",
                "dynamic_variables": {
                    "name": "Inbound Ada",
                },
            },
        )

        self.assertEqual(result["first_message"], "Hi Inbound Ada.")
        self.assertEqual(result["system_prompt"], "Use Starter.")


if __name__ == "__main__":
    unittest.main()
