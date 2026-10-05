import os
import sys
import unittest
import asyncio
from unittest.mock import patch
from types import SimpleNamespace

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.worker_handler import (
    PREVIEW_TRANSCRIPT_TOPIC,
    apply_initiation_webhook_metadata,
    apply_metadata_overrides,
    build_call_context,
    merge_participant_metadata,
    parse_metadata,
    parse_preview_user_transcript_packet,
    consume_preview_user_transcript_stream,
    resolve_webhook_dynamic_variables,
    speak_first_message,
    value_at_json_path,
    webhook_body_values,
)
from livekit.agents import room_io
from livekit import rtc

from main import (
    Assistant,
    attach_resolved_voice_config,
    build_agent_instructions,
    build_room_options,
    build_session_provider_kwargs,
    end_call_without_billing,
    entrypoint,
    provider_section,
    selected_billing_model_ids,
    wait_for_billed_participant,
)


class _RoomExitContext:
    def __init__(self, delete_error=None):
        self.room = type("Room", (), {"name": "outbound_call-1"})()
        self.api = SimpleNamespace(room=SimpleNamespace(delete_room=self.delete_room))
        self.events = []
        self._delete_error = delete_error

    async def delete_room(self, request):
        self.events.append(("delete_room", request.room))
        if self._delete_error:
            raise self._delete_error

    def shutdown(self, reason=""):
        self.events.append(("shutdown", reason))


class EarlyExitHangUpTests(unittest.TestCase):
    def test_early_exit_deletes_the_room_before_shutting_down(self):
        ctx = _RoomExitContext()

        asyncio.run(end_call_without_billing(ctx, "participant_connection_timeout"))

        self.assertEqual(
            ctx.events,
            [
                ("delete_room", "outbound_call-1"),
                ("shutdown", "participant_connection_timeout"),
            ],
        )

    def test_early_exit_still_shuts_down_when_room_deletion_fails(self):
        ctx = _RoomExitContext(delete_error=RuntimeError("livekit unavailable"))

        asyncio.run(end_call_without_billing(ctx, "participant_connection_failed"))

        self.assertEqual(ctx.events[-1], ("shutdown", "participant_connection_failed"))

    def test_entrypoint_failure_hangs_up_the_room_and_reraises(self):
        ctx = _RoomExitContext()

        async def failing_entrypoint(_ctx):
            raise RuntimeError("config fetch failed")

        with patch("main._run_entrypoint", failing_entrypoint):
            with self.assertRaisesRegex(RuntimeError, "config fetch failed"):
                asyncio.run(entrypoint(ctx))

        self.assertEqual(
            ctx.events,
            [("delete_room", "outbound_call-1"), ("shutdown", "entrypoint_failed")],
        )


class WorkerCallTimingTests(unittest.IsolatedAsyncioTestCase):
    async def test_connection_clock_starts_after_sip_answers(self):
        import time

        room = rtc.EventEmitter()
        caller = SimpleNamespace(identity="caller", attributes={"sip.callStatus": "dialing"},
                                 kind=rtc.ParticipantKind.PARTICIPANT_KIND_SIP)
        joined = asyncio.Event()

        async def wait_for_participant():
            joined.set()
            return caller

        ctx = SimpleNamespace(room=room, wait_for_participant=wait_for_participant)
        # Inbound startup must not wait for an answer that requires the agent.
        inbound, _, _ = await asyncio.wait_for(wait_for_billed_participant(ctx), 1)
        self.assertIs(inbound, caller)
        joined.clear()
        waiting = asyncio.create_task(wait_for_billed_participant(ctx, wait_for_answer=True))
        await joined.wait()
        self.assertFalse(waiting.done())
        answered_at = time.monotonic()
        room.emit("participant_attributes_changed", {"sip.callStatus": "active"}, caller)
        participant, connected_at, _ = await asyncio.wait_for(waiting, 1)
        self.assertIs(participant, caller)
        self.assertGreaterEqual(connected_at, answered_at)


class WorkerHandlerTests(unittest.TestCase):
    def test_wait_for_billed_participant_targets_preview_identity_before_timing(self):
        class FakeContext:
            def __init__(self):
                self.identities = []

            async def wait_for_participant(self, *, identity=None):
                self.identities.append(identity)
                return {"identity": identity}

        context = FakeContext()
        with patch.dict(
            os.environ,
            {"AI_PARTICIPANT_WAIT_TIMEOUT_SECONDS": "1"},
            clear=False,
        ):
            participant, connected_monotonic, connected_at = asyncio.run(
                wait_for_billed_participant(context, identity="preview-user-123")
            )

        self.assertEqual(context.identities, ["preview-user-123"])
        self.assertEqual(participant["identity"], "preview-user-123")
        self.assertGreater(connected_monotonic, 0)
        self.assertIsNotNone(connected_at.tzinfo)

    def test_build_agent_instructions_mentions_livekit_dtmf_tool_when_ivr_navigation_enabled(self):
        instructions = build_agent_instructions(
            {"ivr_navigation_enabled": True},
            {"direction": "outbound"},
        )

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

    def test_assistant_keeps_livekit_dtmf_tool_off_for_inbound_calls(self):
        agent = Assistant(
            system_prompt="Use available tools.",
            config={"ivr_navigation_enabled": True},
            call_context={"direction": "inbound"},
        )

        self.assertNotIn("send_dtmf_events", [tool.id for tool in agent.tools])

    def test_assistant_keeps_livekit_dtmf_tool_off_for_non_telephony_sessions(self):
        for metadata in ({"mode": "preview"}, {"mode": "widget"}, {"source": "web_widget"}):
            with self.subTest(metadata=metadata):
                agent = Assistant(
                    system_prompt="Use available tools.",
                    config={"ivr_navigation_enabled": True},
                    call_context={"direction": "outbound", "metadata": metadata},
                )

                self.assertNotIn("send_dtmf_events", [tool.id for tool in agent.tools])

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
            "billing_model": "deepgram/aura-2",
        })

    def test_selected_billing_model_ids_preserve_catalog_ids(self):
        self.assertEqual(
            selected_billing_model_ids(
                {
                    "voice_config": {
                        "stt": {
                            "provider": "deepgram",
                            "model": "nova-3",
                            "billing_model": "deepgram/nova-3-multilingual",
                        },
                        "llm": {
                            "provider": "bedrock",
                            "model": "us.amazon.nova-micro-v1:0",
                        },
                        "tts": {"provider": "deepgram", "model": "aura-2"},
                    }
                }
            ),
            {
                "stt": "deepgram/nova-3-multilingual",
                "llm": "bedrock/us.amazon.nova-micro-v1:0",
                "tts": "deepgram/aura-2",
            },
        )

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

    def test_build_call_context_prefers_provider_billable_call_identifiers(self):
        context = build_call_context(
            room_name="outbound-room",
            metadata={
                "direction": "outbound",
                "providerCallId": "generic-id",
                "sip.callID": "short-sip-id",
                "sip.callIDFull": "full-sip-id",
                "sip.twilio.callSid": "CA123456789",
            },
        )

        self.assertEqual(context["provider_call_id"], "CA123456789")

        telnyx_context = build_call_context(
            room_name="outbound-room",
            metadata={
                "providerCallId": "generic-id",
                "sip.callID": "short-sip-id",
                "sip.callIDFull": "full-sip-id",
            },
        )
        self.assertEqual(telnyx_context["provider_call_id"], "full-sip-id")

        sip_fallback_context = build_call_context(
            room_name="outbound-room",
            metadata={
                "providerCallId": "generic-id",
                "sip.callID": "short-sip-id",
            },
        )
        self.assertEqual(sip_fallback_context["provider_call_id"], "short-sip-id")

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

    def test_build_call_context_preserves_provider_call_id_for_cost_reconciliation(self):
        context = build_call_context(
            room_name="call-room",
            metadata={
                "agentId": "agent-123",
                "provider": "TWILIO",
                "sip.callID": "livekit-sip-call",
                "sip.callIDFull": "CA-provider-call-123",
            },
        )

        self.assertEqual(context["call_id"], "livekit-sip-call")
        self.assertEqual(context["provider_call_id"], "CA-provider-call-123")
        self.assertEqual(context["provider"], "TWILIO")

    def test_build_call_context_uses_outbound_metadata_numbers_when_present(self):
        context = build_call_context(
            room_name="outbound-room",
            metadata={
                "agent_id": "8d55565f-1111-4111-8111-f95fd03f0df2",
                "direction": "outbound",
                "from_number": "+15551230000",
                "to_number": "+15550001111",
                "outbound_id": "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113",
                "sip.callID": "carrier-call-id-123",
            },
        )

        self.assertEqual(context["direction"], "outbound")
        self.assertEqual(context["agent_number"], "+15551230000")
        self.assertEqual(context["user_number"], "+15550001111")
        self.assertEqual(context["from_number"], "+15551230000")
        self.assertEqual(context["to_number"], "+15550001111")
        self.assertEqual(context["call_id"], "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113")
        self.assertEqual(context["outbound_id"], "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113")
        self.assertEqual(
            context["call_id"],
            "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113",
        )

    def test_build_call_context_uses_outbound_room_id_before_carrier_call_id(self):
        context = build_call_context(
            room_name="outbound_9b1c1f91-c050-444b-a1f1-d9b719e542c1",
            metadata={
                "direction": "outbound",
                "from_number": "+15551230000",
                "to_number": "+15550001111",
                "sip.callID": "carrier-call-id-123",
            },
        )

        self.assertEqual(context["call_id"], "9b1c1f91-c050-444b-a1f1-d9b719e542c1")
        self.assertEqual(context["outbound_id"], "9b1c1f91-c050-444b-a1f1-d9b719e542c1")

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
        self.assertEqual(session.calls, [("Hello caller.", {"allow_interruptions": False})])

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

    def test_apply_metadata_overrides_ignores_legacy_widget_prompt_and_first_message(self):
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

        self.assertEqual(result["first_message"], "Default greeting.")
        self.assertEqual(result["system_prompt"], "Default prompt.")

    def test_widget_metadata_cannot_replace_saved_variables_even_with_outbound_direction(self):
        config = {
            "first_message": "Hi {{name}}.",
            "system_prompt": "Customer {{customer_id}}: {{note}}.",
            "variables": {"placeholders": {"name": "visitor", "customer_id": "saved", "note": "saved instructions"}},
        }
        for marker in ({"mode": "widget"}, {"source": "web_widget", "mode": "preview"}):
            for alias in ("dynamic_variables", "dynamicVariables"):
                with self.subTest(marker=marker, alias=alias):
                    result = apply_metadata_overrides(config, {
                        **marker, "direction": "outbound",
                        "systemPrompt": "untrusted prompt", "firstMessage": "untrusted greeting",
                        alias: {"customer_id": "victim", "note": "untrusted instruction", "extra": "injected"},
                    })
                    self.assertEqual(result["first_message"], "Hi visitor.")
                    self.assertEqual(result["system_prompt"], "Customer saved: saved instructions.")
                    self.assertEqual(result["dynamic_variables"], config["variables"]["placeholders"])
        self.assertEqual(config["system_prompt"], "Customer {{customer_id}}: {{note}}.")

    def test_widget_participant_attributes_cannot_change_dispatch_identity_or_mode(self):
        for marker in ({"mode": "widget"}, {"source": "web_widget"}):
            metadata = {**marker, "agent_id": "saved-agent", "organization_id": "saved-org"}
            result = merge_participant_metadata(metadata, {
                "mode": "preview", "source": "preview", "direction": "outbound",
                "agent_id": "other-agent", "organization_id": "other-org",
                "dynamic_variables": {"customer_id": "victim"}, "system_prompt": "injected",
            })
            self.assertEqual(result, metadata)
        self.assertEqual(
            merge_participant_metadata({"direction": "inbound"}, {"sip.callID": "sip-call"}),
            {"direction": "inbound", "sip.callID": "sip-call"},
        )

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

    def test_legacy_widget_overrides_are_removed_before_the_initiation_webhook(self):
        metadata = {
            "mode": "widget", "agent_id": "saved-agent", "visitor_id": "tracking-only",
            "dynamicVariables": {"customer_id": "victim"},
            "dynamic_variables": {"customer_id": "victim"},
            "system_prompt": "visitor-rendered instructions", "firstMessage": "injected",
        }
        async def fake_fetch(webhook, safe_metadata, call_context):
            self.assertEqual(safe_metadata, {
                "mode": "widget", "agent_id": "saved-agent", "visitor_id": "tracking-only",
            })
            return {"customer_id": "webhook-value"}

        config = {
            "initiation_webhook": {"webhook_url": "https://example.invalid/init"},
            "system_prompt": "Use {{customer_id}}.",
            "variables": {"placeholders": {"customer_id": "saved"}},
        }
        resolved = asyncio.run(apply_initiation_webhook_metadata(config, metadata, {}, fetch_json=fake_fetch))
        result = apply_metadata_overrides(config, resolved)
        self.assertEqual(result["system_prompt"], "Use webhook-value.")
        self.assertEqual(result["dynamic_variables"], {"customer_id": "webhook-value"})

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
                "city": "Webhook City",
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

class RenderingBoundaryTests(unittest.TestCase):
    def test_variable_replacement_is_single_pass(self):
        from handlers.worker_handler import render_dynamic_variables
        result = render_dynamic_variables("Hi {{name}}", {"name": "{{internal_note}}", "internal_note": "private"})
        self.assertEqual(result, "Hi {{internal_note}}")

    def test_startup_does_not_await_queue_replay(self):
        import ast
        from pathlib import Path
        module = ast.parse((Path(ROOT) / "main.py").read_text())
        entry = next(node for node in module.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "entrypoint")
        calls = [node.func for node in ast.walk(entry) if isinstance(node, ast.Call)]
        for call in calls:
            name = call.id if isinstance(call, ast.Name) else getattr(call, "attr", "")
            self.assertNotIn(name, {"flush_call_log_queue", "flush_billing_usage_queue"})

class WidgetWebhookTrustTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_server_webhook_variables_render_widget_templates(self):
        config = {"system_prompt": "Hello {{customer_id}} {{note}}", "first_message": "{{note}}",
            "initiation_webhook": {"webhook_url": "https://tenant.example"}}
        visitor = {"mode": "widget", "dynamic_variables": {"customer_id": "victim"},
            "_initiation_webhook_variables": {"customer_id": "forged"}}
        async def webhook(*_):
            return {"customer_id": "tenant", "note": "{{customer_id}}"}
        metadata = await apply_initiation_webhook_metadata(config, visitor, {}, fetch_json=webhook)
        rendered = apply_metadata_overrides(config, metadata)
        self.assertEqual(rendered["system_prompt"], "Hello tenant {{customer_id}}")
        self.assertEqual(rendered["dynamic_variables"]["customer_id"], "tenant")
