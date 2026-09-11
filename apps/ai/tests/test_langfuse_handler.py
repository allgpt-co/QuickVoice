import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.langfuse_handler import (
    is_langfuse_enabled,
    record_call_to_langfuse,
)


class FakeObservation:
    def __init__(self, client):
        self.client = client

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.client.exited = True


class FakeLangfuseClient:
    def __init__(self):
        self.observations = []
        self.scores = []
        self.flushed = False
        self.exited = False

    def create_trace_id(self, *, seed=None):
        return "a" * 32 if seed else "b" * 32

    def start_as_current_observation(self, **kwargs):
        self.observations.append(kwargs)
        return FakeObservation(self)

    def create_score(self, **kwargs):
        self.scores.append(kwargs)
        return {"id": f"score-{len(self.scores)}"}

    def flush(self):
        self.flushed = True


class LangfuseHandlerTests(unittest.TestCase):
    def test_disabled_without_credentials(self):
        self.assertFalse(is_langfuse_enabled({"LANGFUSE_ENABLED": "true"}))
        self.assertFalse(
            is_langfuse_enabled(
                {
                    "LANGFUSE_PUBLIC_KEY": "pk-lf-test",
                    "LANGFUSE_SECRET_KEY": "sk-lf-test",
                    "LANGFUSE_ENABLED": "false",
                }
            )
        )

    def test_record_call_creates_trace_and_boolean_score(self):
        client = FakeLangfuseClient()
        result = record_call_to_langfuse(
            _payload(),
            config={
                "llm_model": "bedrock/us.amazon.nova-micro-v1:0",
                "stt_model": "deepgram/nova-3",
                "tts_model": "elevenlabs/eleven_flash_v2_5",
            },
            call_context={"mode": "preview", "room_name": "voice-room-1"},
            client=client,
            env={
                "LANGFUSE_CAPTURE_TRANSCRIPTS": "true",
                "LANGFUSE_PROJECT_ID": "project_123",
                "LANGFUSE_BASE_URL": "https://cloud.langfuse.com",
            },
        )

        self.assertEqual(result["trace_id"], "a" * 32)
        self.assertEqual(
            result["trace_url"],
            "https://cloud.langfuse.com/project/project_123/traces/" + ("a" * 32),
        )
        self.assertTrue(client.exited)
        self.assertTrue(client.flushed)
        self.assertEqual(client.observations[0]["as_type"], "agent")
        self.assertEqual(client.observations[0]["name"], "quickvoice.call")
        self.assertEqual(client.observations[0]["metadata"]["evaluationCount"], 1)
        self.assertEqual(len(client.observations[0]["output"]["transcripts"]), 2)
        self.assertEqual(
            client.scores,
            [
                {
                    "trace_id": "a" * 32,
                    "name": "call_eval.qualified",
                    "value": 1.0,
                    "data_type": "BOOLEAN",
                    "comment": "Caller asked for a product demo",
                }
            ],
        )

    def test_zero_pii_retention_prevents_transcript_capture(self):
        client = FakeLangfuseClient()
        payload = _payload()
        payload["metadata"]["zeroPiiRetention"] = True

        record_call_to_langfuse(
            payload,
            client=client,
            env={"LANGFUSE_CAPTURE_TRANSCRIPTS": "true"},
        )

        self.assertNotIn("transcripts", client.observations[0]["output"])
        self.assertEqual(client.observations[0]["output"]["transcriptCount"], 2)
        self.assertTrue(client.observations[0]["metadata"]["zeroPiiRetention"])


def _payload():
    return {
        "organizationId": "org_123",
        "userId": "user_123",
        "agentId": "agent_123",
        "callId": "call_123",
        "startTime": "2026-01-01T00:00:00Z",
        "endTime": "2026-01-01T00:01:00Z",
        "direction": "inbound",
        "durationSeconds": 60,
        "status": "COMPLETED",
        "metadata": {"summary": "Caller wanted a demo", "intent": "sales"},
        "recordingSid": "",
        "provider": "WEB_WIDGET",
        "transcripts": [
            {"role": "user", "message": "I want a demo", "timestamp": "2026-01-01T00:00:03Z"},
            {"role": "agent", "message": "I can help with that.", "timestamp": "2026-01-01T00:00:04Z"},
        ],
        "extractedData": [],
        "evaluatedData": [
            {
                "identifier": "qualified",
                "description": "Caller asked for a product demo",
                "value": True,
            }
        ],
    }


if __name__ == "__main__":
    unittest.main()
