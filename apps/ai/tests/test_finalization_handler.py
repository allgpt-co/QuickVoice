import asyncio
import os
import sys
import unittest
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.finalization_handler import CallFinalizer


class FinalizationHandlerTests(unittest.TestCase):
    def test_call_duration_uses_disconnect_time_not_delayed_finalization(self):
        posts = []

        async def post(payload):
            posts.append(payload)

        finalizer = CallFinalizer(
            config={"agent_id": "agent_123", "organization_id": "org_123"},
            call_context={"call_id": "call_123"},
            started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            recording_path=None,
            transcript_reader=lambda: [],
            post_call_log=post,
        )
        asyncio.run(finalizer.finalize(ended_at=datetime(2026, 1, 1, 0, 10, tzinfo=timezone.utc)))
        self.assertEqual(posts[0]["durationSeconds"], 600)
        self.assertEqual(posts[0]["endTime"], "2026-01-01T00:10:00Z")

    def test_call_finalizer_posts_only_once_when_shutdown_runs_multiple_times(self):
        posts = []

        def transcript_reader():
            return [{"role": "user", "content": "Hello", "time": datetime(2026, 1, 1, tzinfo=timezone.utc)}]

        async def post_call_log(payload):
            posts.append(payload)

        finalizer = CallFinalizer(
            config={"agent_id": "agent_123", "organization_id": "org_123"},
            call_context={
                "call_id": "call_123",
                "from_number": "+15550001111",
                "to_number": "+15551230000",
            },
            started_at=datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            recording_path=None,
            transcript_reader=transcript_reader,
            post_call_log=post_call_log,
        )

        asyncio.run(finalizer.finalize())
        asyncio.run(finalizer.finalize())

        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["callId"], "call_123")

    def test_call_finalizer_omits_transcripts_and_recording_for_zero_pii_retention(self):
        posts = []

        def transcript_reader():
            return [{"role": "user", "content": "Sensitive", "time": datetime(2026, 1, 1, tzinfo=timezone.utc)}]

        async def post_call_log(payload):
            posts.append(payload)

        finalizer = CallFinalizer(
            config={
                "agent_id": "agent_123",
                "organization_id": "org_123",
                "zero_pii_retention": True,
                "retention_days": 3,
                "data_extracted": [
                    {
                        "type": "text",
                        "name": "Patient name",
                        "description": "Caller name",
                        "value": "Avery Stone",
                    }
                ],
                "data_evaluated": [
                    {
                        "identifier": "qualified",
                        "description": "Caller wants a demo",
                        "value": True,
                    }
                ],
            },
            call_context={
                "call_id": "call_123",
                "from_number": "+15550001111",
                "to_number": "+15551230000",
            },
            started_at=datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            recording_path="Voice-agents/Recordings/recording-123.ogg",
            transcript_reader=transcript_reader,
            post_call_log=post_call_log,
        )

        asyncio.run(finalizer.finalize())

        self.assertEqual(posts[0]["transcripts"], [])
        self.assertEqual(posts[0]["recordingSid"], "")
        self.assertEqual(posts[0]["extractedData"], [])
        self.assertEqual(posts[0]["evaluatedData"], [])
        self.assertTrue(posts[0]["metadata"]["zeroPiiRetention"])
        self.assertEqual(posts[0]["metadata"]["retentionDays"], 3)


if __name__ == "__main__":
    unittest.main()
