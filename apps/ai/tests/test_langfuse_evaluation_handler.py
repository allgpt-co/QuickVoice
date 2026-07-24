import os
import sys
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.langfuse_evaluation_handler import LangfuseEvaluationHandler


class _FakeObservation:
    def __init__(self):
        self.trace_scores = []

    def score_trace(self, **kwargs):
        self.trace_scores.append(kwargs)


class _FakeContextManager:
    def __init__(self, observation):
        self._observation = observation

    def __enter__(self):
        return self._observation

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeLangfuseClient:
    def __init__(self):
        self.observation = _FakeObservation()
        self.started_with = None
        self.flush_called = False

    def create_trace_id(self, *, seed: str) -> str:
        return f"trace-{seed}"

    def start_as_current_observation(self, **kwargs):
        self.started_with = kwargs
        return _FakeContextManager(self.observation)

    def flush(self):
        self.flush_called = True


class LangfuseEvaluationHandlerTests(unittest.TestCase):
    def test_publish_call_evaluations_sends_core_and_configured_scores(self):
        client = _FakeLangfuseClient()
        handler = LangfuseEvaluationHandler(client)

        handler.publish_call_evaluations(
            config={"zero_pii_retention": False},
            call_context={"call_id": "call_123"},
            started_at=datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            ended_at=datetime(2026, 1, 1, 0, 1, 0, tzinfo=timezone.utc),
            transcripts=[
                {"role": "user", "content": "I need help with billing"},
                {"role": "agent", "content": "Sure, I can help with billing"},
            ],
            payload={
                "callId": "call_123",
                "agentId": "agent_123",
                "organizationId": "org_123",
                "status": "COMPLETED",
                "direction": "inbound",
                "provider": "TWILIO",
                "metadata": {"summary": "Billing support call"},
                "evaluatedData": [
                    {"identifier": "qualified_lead", "description": "lead status", "value": True},
                    {"identifier": "intent", "description": "intent label", "value": "billing"},
                ],
            },
        )

        self.assertTrue(client.flush_called)
        self.assertEqual(client.started_with["as_type"], "evaluator")
        self.assertEqual(client.started_with["trace_context"]["trace_id"], "trace-quickvoice:call_123")
        self.assertEqual(client.started_with["input"], "I need help with billing")
        self.assertEqual(client.started_with["output"], "Sure, I can help with billing")

        scores_by_name = {item["name"]: item for item in client.observation.trace_scores}
        self.assertEqual(scores_by_name["call_completed"]["data_type"], "BOOLEAN")
        self.assertEqual(scores_by_name["call_completed"]["value"], 1)
        self.assertEqual(scores_by_name["configured_qualified_lead"]["data_type"], "BOOLEAN")
        self.assertEqual(scores_by_name["configured_qualified_lead"]["value"], 1)
        self.assertEqual(scores_by_name["configured_intent"]["data_type"], "CATEGORICAL")
        self.assertEqual(scores_by_name["configured_intent"]["value"], "billing")

    def test_publish_call_evaluations_omits_transcript_when_zero_pii_retention_enabled(self):
        client = _FakeLangfuseClient()
        handler = LangfuseEvaluationHandler(client)

        handler.publish_call_evaluations(
            config={"zero_pii_retention": True},
            call_context={"call_id": "call_123"},
            started_at=datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            ended_at=datetime(2026, 1, 1, 0, 1, 0, tzinfo=timezone.utc),
            transcripts=[
                {"role": "user", "content": "Sensitive value"},
                {"role": "agent", "content": "Sensitive response"},
            ],
            payload={
                "callId": "call_123",
                "agentId": "agent_123",
                "organizationId": "org_123",
                "status": "COMPLETED",
                "direction": "inbound",
                "provider": "TWILIO",
                "metadata": {"summary": "Sensitive summary"},
                "evaluatedData": [],
            },
        )

        self.assertIsNone(client.started_with["input"])
        self.assertIsNone(client.started_with["output"])
        self.assertNotIn("summary", client.started_with["metadata"])

    def test_from_env_returns_none_when_disabled(self):
        with patch.dict(os.environ, {"LANGFUSE_ENABLED": "false"}, clear=False):
            self.assertIsNone(LangfuseEvaluationHandler.from_env())

    def test_from_env_raises_when_enabled_without_required_variables(self):
        with patch.dict(os.environ, {"LANGFUSE_ENABLED": "true"}, clear=True):
            with self.assertRaises(RuntimeError):
                LangfuseEvaluationHandler.from_env()


if __name__ == "__main__":
    unittest.main()
