import json
import os
import sys
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.live_transcript_publisher import (
    LIVE_TRANSCRIPT_CHANNEL,
    LiveTranscriptPublisher,
)


class FakeRedis:
    def __init__(self, error=None):
        self.error = error
        self.calls = []

    async def eval(self, script, key_count, *args):
        if self.error:
            raise self.error
        payload = json.loads(args[5])
        stream_id = f"1704067200000-{len(self.calls)}"
        payload["eventId"] = stream_id
        self.calls.append(
            {
                "key_count": key_count,
                "keys": args[:4],
                "dedup": args[4],
                "payload": payload,
                "call_id": args[6],
                "ttl": args[7],
                "channel": args[8],
            }
        )
        return stream_id


def publisher(redis_client, *, zero_pii_retention=False):
    return LiveTranscriptPublisher(
        config={
            "organization_id": "org-1",
            "agent_id": "agent-1",
            "zero_pii_retention": zero_pii_retention,
        },
        call_context={
            "call_id": "call-1",
            "direction": "inbound",
            "from_number": "+15550000001",
            "to_number": "+15550000002",
        },
        room_name="room-1",
        redis_client=redis_client,
        ttl_seconds=3600,
    )


class LiveTranscriptPublisherTests(unittest.IsolatedAsyncioTestCase):
    async def test_publishes_lifecycle_and_final_turns_in_order(self):
        redis = FakeRedis()
        live = publisher(redis)
        started_at = datetime(2024, 1, 1, tzinfo=timezone.utc)

        await live.start(started_at)
        live.publish_transcript(
            {
                "id": "user-1",
                "role": "user",
                "content": "Hello",
                "time": "2024-01-01T00:00:01Z",
            }
        )
        live.publish_transcript(
            {
                "id": "agent-2",
                "role": "agent",
                "content": "How can I help?",
                "time": "2024-01-01T00:00:02Z",
            }
        )
        await live.close(reason="participant_disconnected")

        self.assertEqual(
            [call["payload"]["type"] for call in redis.calls],
            ["call.started", "transcript.final", "transcript.final", "call.ended"],
        )
        self.assertEqual(redis.calls[1]["payload"]["speaker"], "user")
        self.assertEqual(redis.calls[2]["payload"]["speaker"], "agent")
        self.assertEqual(redis.calls[-1]["ttl"], "3600")
        self.assertTrue(all(call["channel"] == LIVE_TRANSCRIPT_CHANNEL for call in redis.calls))
        self.assertEqual(redis.calls[1]["payload"]["text"], "Hello")

    async def test_zero_pii_retention_never_publishes_transcript_text(self):
        redis = FakeRedis()
        live = publisher(redis, zero_pii_retention=True)

        await live.start("2024-01-01T00:00:00Z")
        live.publish_transcript(
            {
                "id": "user-1",
                "role": "user",
                "content": "My social security number is 123-45-6789",
                "time": "2024-01-01T00:00:01Z",
            }
        )
        await live.close(reason="participant_disconnected")

        self.assertEqual(
            [call["payload"]["type"] for call in redis.calls],
            ["call.started", "call.ended"],
        )
        self.assertNotIn(
            "123-45-6789",
            json.dumps(redis.calls),
        )

    async def test_redis_failure_is_fail_open(self):
        live = publisher(FakeRedis(RuntimeError("redis unavailable")))

        with patch(
            "handlers.live_transcript_publisher.PUBLISH_ATTEMPTS", 1
        ):
            await live.start("2024-01-01T00:00:00Z")
            live.publish_transcript(
                {
                    "id": "user-1",
                    "role": "user",
                    "content": "Still connected",
                    "time": "2024-01-01T00:00:01Z",
                }
            )
            await live.close(flush_timeout=1)

    async def test_missing_call_identity_disables_without_connecting(self):
        live = LiveTranscriptPublisher(
            config={"organization_id": ""},
            call_context={"call_id": "call-1"},
            room_name="room-1",
            redis_client=FakeRedis(),
        )

        await live.start()
        live.publish_transcript(
            {"id": "user-1", "role": "user", "content": "Ignored"}
        )
        await live.close()

        self.assertFalse(live.enabled)


if __name__ == "__main__":
    unittest.main()
