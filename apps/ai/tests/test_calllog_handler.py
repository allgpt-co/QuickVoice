import asyncio
import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.calllog_handler import (
    build_call_log_payload,
    enqueue_call_log,
    flush_call_log_queue,
    post_call_log,
)


class CallLogHandlerTests(unittest.TestCase):
    def test_build_call_log_payload_maps_livekit_session_to_server_ingest_schema(self):
        payload = build_call_log_payload(
            config={
                "agent_id": "8d55565f-1111-4111-8111-f95fd03f0df2",
                "organization_id": "org_123",
                "user_id": "user_123",
                "provider": "TWILIO",
            },
            call_context={
                "call_id": "room-123",
                "direction": "inbound",
                "from_number": "+15550001111",
                "to_number": "+15551230000",
            },
            started_at=datetime(2026, 5, 27, 12, 0, 0, tzinfo=timezone.utc),
            ended_at=datetime(2026, 5, 27, 12, 1, 5, tzinfo=timezone.utc),
            recording_path="Voice-agents/Recordings/recording-123.ogg",
            transcripts=[
                {"role": "user", "content": "Hi", "time": datetime(2026, 5, 27, 12, 0, 5, tzinfo=timezone.utc)},
                {"role": "assistant", "content": "Hello", "time": "2026-05-27T12:00:06+00:00"},
            ],
        )

        self.assertEqual(payload["organizationId"], "org_123")
        self.assertEqual(payload["userId"], "user_123")
        self.assertEqual(payload["agentId"], "8d55565f-1111-4111-8111-f95fd03f0df2")
        self.assertEqual(payload["callId"], "room-123")
        self.assertEqual(payload["direction"], "inbound")
        self.assertEqual(payload["startTime"], "2026-05-27T12:00:00Z")
        self.assertEqual(payload["endTime"], "2026-05-27T12:01:05Z")
        self.assertEqual(payload["durationSeconds"], 65)
        self.assertEqual(payload["status"], "COMPLETED")
        self.assertEqual(payload["recordingSid"], "Voice-agents/Recordings/recording-123.ogg")
        self.assertEqual(payload["provider"], "TWILIO")
        self.assertEqual(payload["fromNumber"], "+15550001111")
        self.assertEqual(payload["toNumber"], "+15551230000")
        self.assertEqual(payload["transcripts"][0]["role"], "user")
        self.assertEqual(payload["transcripts"][0]["message"], "Hi")
        self.assertEqual(payload["transcripts"][0]["timestamp"], "2026-05-27T12:00:05Z")
        self.assertEqual(payload["transcripts"][1]["role"], "agent")
        self.assertEqual(payload["transcripts"][1]["message"], "Hello")

    def test_build_call_log_payload_preserves_numeric_epoch_transcript_timestamps(self):
        payload = build_call_log_payload(
            config={
                "agent_id": "agent_123",
                "organization_id": "org_123",
                "provider": "TWILIO",
            },
            call_context={
                "call_id": "room-123",
                "agent_id": "22222222-2222-4222-8222-222222222222",
                "from_number": "+15550001111",
                "to_number": "+15551230000",
            },
            started_at=datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            ended_at=datetime(2024, 1, 1, 0, 1, 0, tzinfo=timezone.utc),
            recording_path=None,
            transcripts=[{"role": "user", "content": "Hi", "time": 1704067200.0}],
        )

        self.assertEqual(payload["transcripts"][0]["timestamp"], "2024-01-01T00:00:00Z")


    def test_build_call_log_payload_includes_flow_metadata(self):
        payload = build_call_log_payload(
            config={
                "agent_id": "8d55565f-1111-4111-8111-f95fd03f0df2",
                "organization_id": "org_123",
                "provider": "TWILIO",
                "flow": {"flowId": "44444444-4444-4444-8444-444444444444"},
            },
            call_context={
                "call_id": "room-123",
                "agent_id": "22222222-2222-4222-8222-222222222222",
                "from_number": "+15550001111",
                "to_number": "+15551230000",
                "flow_state": {"agent_id": "33333333-3333-4333-8333-333333333333"},
                "flow_path": [
                    {"node_id": "start", "agent_id": "8d55565f-1111-4111-8111-f95fd03f0df2", "reason": None},
                    {
                        "node_id": "returns",
                        "agent_id": "22222222-2222-4222-8222-222222222222",
                        "reason": "Customer needs returns",
                    },
                ],
            },
            started_at=datetime(2026, 5, 27, 12, 0, 0, tzinfo=timezone.utc),
            ended_at=datetime(2026, 5, 27, 12, 1, 0, tzinfo=timezone.utc),
            recording_path=None,
            transcripts=[],
        )

        self.assertEqual(payload["agentId"], "33333333-3333-4333-8333-333333333333")
        self.assertEqual(
            payload["metadata"]["flow"],
            {
                "flowId": "44444444-4444-4444-8444-444444444444",
                "path": [
                    {"node_id": "start", "agent_id": "8d55565f-1111-4111-8111-f95fd03f0df2", "reason": None},
                    {
                        "node_id": "returns",
                        "agent_id": "22222222-2222-4222-8222-222222222222",
                        "reason": "Customer needs returns",
                    },
                ],
            },
        )

    def test_post_call_log_uses_internal_auth_and_posts_to_server_calls_endpoint(self):
        calls = []

        async def fake_post_json(url, headers, body):
            calls.append((url, headers, body))
            return {"success": True, "data": {"callId": body["callId"]}}

        result = asyncio.run(
            post_call_log(
                {"callId": "room-123", "organizationId": "org_123", "userId": "user_123"},
                server_api_url="http://server.test/api/v1",
                internal_api_key="internal-secret",
                post_json=fake_post_json,
            )
        )

        self.assertEqual(result["data"]["callId"], "room-123")
        self.assertEqual(len(calls), 1)
        url, headers, body = calls[0]
        self.assertEqual(url, "http://server.test/api/v1/calls")
        self.assertEqual(headers["Authorization"], "Bearer internal-secret")
        self.assertEqual(headers["x-organization-id"], "org_123")
        self.assertEqual(headers["x-user-id"], "user_123")
        self.assertEqual(body["callId"], "room-123")

    def test_post_call_log_appends_api_version_when_server_url_is_origin(self):
        calls = []

        async def fake_post_json(url, headers, body):
            calls.append((url, headers, body))
            return {"success": True, "data": {"callId": body["callId"]}}

        asyncio.run(
            post_call_log(
                {"callId": "room-123", "organizationId": "org_123", "userId": "user_123"},
                server_api_url="https://api.quickvoice.co",
                internal_api_key="internal-secret",
                post_json=fake_post_json,
            )
        )

        self.assertEqual(calls[0][0], "https://api.quickvoice.co/api/v1/calls")

    def test_enqueue_and_flush_call_log_queue_retries_durable_payloads(self):
        with tempfile.TemporaryDirectory() as tmp:
            queue_dir = Path(tmp)
            queued_path = enqueue_call_log(
                {"callId": "room-123", "organizationId": "org_123"},
                queue_dir=queue_dir,
            )

            self.assertTrue(queued_path.exists())

            posted = []

            async def fake_post_json(url, headers, body):
                posted.append((url, headers, body))
                return {"success": True}

            result = asyncio.run(
                flush_call_log_queue(
                    queue_dir=queue_dir,
                    server_api_url="http://server.test",
                    internal_api_key="internal-secret",
                    post_json=fake_post_json,
                )
            )

            self.assertEqual(result["posted"], 1)
            self.assertEqual(result["failed"], 0)
            self.assertFalse(queued_path.exists())
            self.assertEqual(posted[0][2]["callId"], "room-123")


if __name__ == "__main__":
    unittest.main()
