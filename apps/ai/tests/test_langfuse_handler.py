import os
import sys
import unittest
from unittest.mock import patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.langfuse_handler import LangfuseCallObserver


class FakeObservation:
    def __init__(self, name="root"):
        self.name = name
        self.children = []
        self.updates = []
        self.ended = False

    def start_observation(self, **kwargs):
        child = FakeObservation(kwargs["name"])
        child.start_kwargs = kwargs
        self.children.append(child)
        return child

    def update(self, **kwargs):
        self.updates.append(kwargs)
        return self

    def end(self):
        self.ended = True
        return self


class FakeLangfuse:
    def __init__(self, **kwargs):
        self.init_kwargs = kwargs
        self.root_calls = []
        self.scores = []
        self.flush_count = 0
        self.shutdown_count = 0

    @staticmethod
    def create_trace_id(*, seed=None):
        return "a" * 32

    def start_observation(self, **kwargs):
        self.root_calls.append(kwargs)
        self.root = FakeObservation()
        return self.root

    def create_score(self, **kwargs):
        self.scores.append(kwargs)

    def flush(self):
        self.flush_count += 1

    def shutdown(self):
        self.shutdown_count += 1


def enabled_env(**overrides):
    env = {
        "LANGFUSE_ENABLED": "true",
        "LANGFUSE_PUBLIC_KEY": "public-test-key",
        "LANGFUSE_SECRET_KEY": "secret-test-key",
        "LANGFUSE_HOST": "https://cloud.langfuse.com",
        "LANGFUSE_ENVIRONMENT": "test",
        "LANGFUSE_RELEASE": "test-release",
        "LANGFUSE_SAMPLE_RATE": "1.0",
        "LANGFUSE_EVALUATION_ENABLED": "true",
    }
    env.update(overrides)
    return env


class LangfuseHandlerTests(unittest.TestCase):
    def test_disabled_integration_does_not_initialize_client(self):
        calls = []
        observer = LangfuseCallObserver(
            env=enabled_env(LANGFUSE_ENABLED="false"),
            client_factory=lambda **kwargs: calls.append(kwargs),
        )

        observer.start_call(room_name="room-1", call_context={}, config={})

        self.assertFalse(observer.enabled)
        self.assertEqual(calls, [])

    def test_missing_credentials_disable_integration(self):
        calls = []
        observer = LangfuseCallObserver(
            env=enabled_env(LANGFUSE_SECRET_KEY=""),
            client_factory=lambda **kwargs: calls.append(kwargs),
        )

        observer.start_call(room_name="room-1", call_context={}, config={})

        self.assertFalse(observer.enabled)
        self.assertEqual(calls, [])

    def test_start_call_uses_installed_v4_root_observation_api(self):
        clients = []

        def factory(**kwargs):
            client = FakeLangfuse(**kwargs)
            clients.append(client)
            return client

        observer = LangfuseCallObserver(env=enabled_env(), client_factory=factory)
        observer.start_call(
            room_name="voice-room-1",
            call_context={
                "call_id": "call-1",
                "agent_id": "agent-1",
                "direction": "inbound",
                "provider": "TWILIO",
            },
            config={
                "organization_id": "org-1",
                "agent_language": "en-US",
                "stt_model": "deepgram/nova-3",
                "llm_model": "bedrock/model-1",
                "tts_model": "elevenlabs/model-1",
            },
            preview_mode=False,
        )

        self.assertTrue(observer.enabled)
        self.assertEqual(clients[0].init_kwargs["base_url"], "https://cloud.langfuse.com")
        self.assertEqual(clients[0].init_kwargs["environment"], "test")
        root_call = clients[0].root_calls[0]
        self.assertEqual(root_call["name"], "quickvoice.voice_call")
        self.assertEqual(root_call["as_type"], "agent")
        self.assertEqual(root_call["trace_context"], {"trace_id": "a" * 32})
        self.assertNotIn("from_number", str(root_call))
        self.assertNotIn("to_number", str(root_call))

    def test_initialization_and_api_failures_never_escape(self):
        broken_init = LangfuseCallObserver(
            env=enabled_env(),
            client_factory=lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("unavailable")),
        )
        broken_init.start_call(room_name="room-1", call_context={}, config={})
        self.assertFalse(broken_init.enabled)

        class BrokenClient(FakeLangfuse):
            def start_observation(self, **kwargs):
                raise RuntimeError("api unavailable")

        broken_api = LangfuseCallObserver(env=enabled_env(), client_factory=BrokenClient)
        broken_api.start_call(room_name="room-1", call_context={}, config={})
        self.assertFalse(broken_api.enabled)

    def test_integration_error_logs_never_include_configured_keys(self):
        env = enabled_env(
            LANGFUSE_PUBLIC_KEY="public-sensitive-value",
            LANGFUSE_SECRET_KEY="secret-sensitive-value",
        )
        observer = LangfuseCallObserver(
            env=env,
            client_factory=lambda **_kwargs: (_ for _ in ()).throw(
                RuntimeError("secret-sensitive-value failed")
            ),
        )

        with patch("handlers.langfuse_handler.logger") as mocked_logger:
            observer.start_call(room_name="room-1", call_context={}, config={})

        logged = str(mocked_logger.warning.call_args)
        self.assertNotIn("public-sensitive-value", logged)
        self.assertNotIn("secret-sensitive-value", logged)

    def test_transcript_observations_are_metadata_only_by_default(self):
        client = FakeLangfuse()
        observer = LangfuseCallObserver(env=enabled_env(), client_factory=lambda **_kwargs: client)
        observer.start_call(
            room_name="room-1",
            call_context={"call_id": "call-1"},
            config={"zero_pii_retention": False},
        )

        observer.record_transcript(
            {"role": "user", "content": "My number is +15550001111", "time": 1704067200.0}
        )

        transcript = client.root.children[0].start_kwargs
        self.assertEqual(transcript["name"], "quickvoice.transcript.user")
        self.assertEqual(transcript["metadata"]["role"], "user")
        self.assertEqual(transcript["metadata"]["character_count"], 25)
        self.assertNotIn("My number", str(transcript))
        self.assertNotIn("+15550001111", str(transcript))

    def test_configuration_and_session_startup_update_the_call_trace(self):
        client = FakeLangfuse()
        observer = LangfuseCallObserver(env=enabled_env(), client_factory=lambda **_kwargs: client)
        observer.start_call(
            room_name="room-1",
            call_context={"call_id": "call-1"},
            config={},
        )

        observer.record_configuration(
            success=True,
            duration_seconds=0.1,
            config={"llm_model": "bedrock/model-1"},
        )
        observer.record_session_startup(success=True, duration_seconds=0.2)

        self.assertEqual(
            [item.name for item in client.root.children],
            ["quickvoice.configuration_loading", "quickvoice.agent_session_startup"],
        )
        self.assertEqual(client.root.updates[-1]["metadata"]["llm_model"], "bedrock/model-1")

    def test_deterministic_scores_cover_zero_tool_calls(self):
        client = FakeLangfuse()
        observer = LangfuseCallObserver(env=enabled_env(), client_factory=lambda **_kwargs: client)
        observer.start_call(room_name="room-1", call_context={"call_id": "call-1"}, config={})
        observer.record_transcript({"role": "user", "content": "Hi", "time": 1})
        observer.record_transcript({"role": "agent", "content": "Hello", "time": 2})

        scores = observer.finish(
            call_completed=True,
            ended_normally=True,
            call_duration_seconds=10.0,
        )

        self.assertEqual(scores["call_completed"], 1.0)
        self.assertEqual(scores["has_user_input"], 1.0)
        self.assertEqual(scores["has_agent_response"], 1.0)
        self.assertEqual(scores["tool_success_rate"], 0.0)
        self.assertEqual(scores["rag_success_rate"], 0.0)
        self.assertEqual(scores["conversation_turns"], 2.0)
        self.assertEqual(scores["call_duration_seconds"], 10.0)
        self.assertAlmostEqual(scores["conversation_quality"], (1 + (5 / 120) + 1 + 1 + 1) / 5)
        self.assertTrue(client.root.ended)
        self.assertEqual(len(client.scores), 8)

    def test_failed_tool_call_reduces_tool_success_and_quality(self):
        client = FakeLangfuse()
        observer = LangfuseCallObserver(env=enabled_env(), client_factory=lambda **_kwargs: client)
        observer.start_call(room_name="room-1", call_context={"call_id": "call-1"}, config={})
        observer.record_transcript({"role": "user", "content": "Hi", "time": 1})
        observer.record_transcript({"role": "agent", "content": "Hello", "time": 2})
        observer.record_tool(
            tool_type="http",
            tool_name="lookup",
            arguments={"phone": "+15550001111"},
            result=None,
            success=False,
            duration_seconds=0.2,
        )

        scores = observer.finish(
            call_completed=True,
            ended_normally=True,
            call_duration_seconds=2.0,
        )

        self.assertEqual(scores["tool_success_rate"], 0.0)
        self.assertAlmostEqual(scores["conversation_quality"], (1 + (5 / 120) + 1 + 0 + 1) / 5)
        tool_observation = next(
            item for item in client.root.children if item.name == "quickvoice.tool.http"
        )
        self.assertNotIn("+15550001111", str(tool_observation.start_kwargs))

    def test_rag_observation_uses_sizes_without_query_text(self):
        client = FakeLangfuse()
        observer = LangfuseCallObserver(env=enabled_env(), client_factory=lambda **_kwargs: client)
        observer.start_call(room_name="room-1", call_context={"call_id": "call-1"}, config={})

        observer.record_rag(
            agent_id="agent-1",
            query="private refund question",
            top_k=5,
            context="matching context",
            success=True,
            duration_seconds=0.1,
        )
        scores = observer.finish(
            call_completed=True,
            ended_normally=True,
            call_duration_seconds=1.0,
        )

        rag = next(item for item in client.root.children if item.name == "quickvoice.rag_retrieval")
        self.assertEqual(rag.start_kwargs["metadata"]["result_size"], 16)
        self.assertNotIn("private refund question", str(rag.start_kwargs))
        self.assertEqual(scores["rag_success_rate"], 1.0)

    def test_flush_and_shutdown_are_safe_and_idempotent(self):
        client = FakeLangfuse()
        observer = LangfuseCallObserver(env=enabled_env(), client_factory=lambda **_kwargs: client)
        observer.start_call(room_name="room-1", call_context={"call_id": "call-1"}, config={})

        observer.flush()
        observer.shutdown()
        observer.shutdown()

        self.assertEqual(client.flush_count, 1)
        self.assertEqual(client.shutdown_count, 1)


if __name__ == "__main__":
    unittest.main()
