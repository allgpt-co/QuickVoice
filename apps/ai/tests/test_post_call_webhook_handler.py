import asyncio
import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.post_call_webhook_handler import (
    _send,
    enqueue_post_call_webhook,
    flush_post_call_webhook_queue,
    post_call_webhook_body,
)


PAYLOAD = {
    "organizationId": "org_1", "agentId": "agent_1", "callId": "call_1",
    "recordingSid": "recordings/call_1.ogg", "transcripts": [{"message": "Hello"}],
    "metadata": {},
    "_webhookDestinationHash": hashlib.sha256(b"https://example.com/hook").hexdigest(),
}


class PostCallWebhookTests(unittest.TestCase):
    def test_sender_uses_guarded_http_and_keeps_idempotency_header(self):
        webhook = {
            "webhook_url": "https://example.com/hook", "transcript": False,
            "audio_url": False,
            "headers": {"Idempotency-Key": {"value": "override", "type": "Value"}},
        }
        with patch("handlers.post_call_webhook_handler.safe_https_request") as safe_request:
            _send(PAYLOAD, webhook)
        request = safe_request.call_args.args[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("Idempotency-key"), "quickvoice-post-call-call_1")
        self.assertNotIn("transcript", json.loads(request.data))
        self.assertFalse(safe_request.call_args.kwargs["read_response_body"])

    def test_enqueue_is_private_and_retries_without_duplicate_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path = enqueue_post_call_webhook(PAYLOAD, queue_dir=Path(directory) / "queue")
            self.assertEqual(path, enqueue_post_call_webhook(PAYLOAD, queue_dir=path.parent))
            self.assertEqual(len(list(path.parent.glob("*.json"))), 1)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)

    def test_privacy_and_include_toggles_control_payload(self):
        webhook = {"transcript": True, "audio_url": True}
        body = post_call_webhook_body(PAYLOAD, webhook, "https://s3.example/signed")
        self.assertEqual(body["transcript"], PAYLOAD["transcripts"])
        self.assertEqual(body["audioUrl"], "https://s3.example/signed")
        private = {**PAYLOAD, "metadata": {"zeroPiiRetention": True}}
        body = post_call_webhook_body(private, webhook, "https://s3.example/signed")
        self.assertNotIn("transcript", body)
        self.assertNotIn("audioUrl", body)
        self.assertNotIn("fromNumber", body)

        with tempfile.TemporaryDirectory() as directory:
            private["fromNumber"] = "+15550001111"
            path = enqueue_post_call_webhook(private, queue_dir=directory)
            self.assertNotIn("+15550001111", path.read_text())

    def test_failed_delivery_retries_then_succeeds(self):
        async def load_config(_agent_id):
            return {"organization_id": "org_1", "post_call_webhook": {"webhook_url": "https://example.com/hook"}}

        attempts = []

        def send(payload, webhook):
            attempts.append(payload["callId"])
            if len(attempts) == 1:
                raise RuntimeError("HTTP 503")

        with tempfile.TemporaryDirectory() as directory, patch(
            "handlers.post_call_webhook_handler.report_webhook_event", new_callable=AsyncMock,
        ) as report:
            path = enqueue_post_call_webhook(PAYLOAD, queue_dir=directory)
            first = asyncio.run(flush_post_call_webhook_queue(queue_dir=directory, load_config=load_config, send=send))
            self.assertEqual(first["failed"], 1)
            self.assertEqual(json.loads(path.read_text())["attempts"], 1)
            envelope = json.loads(path.read_text())
            envelope["nextAttemptAtEpoch"] = 0
            path.write_text(json.dumps(envelope))
            second = asyncio.run(flush_post_call_webhook_queue(queue_dir=directory, load_config=load_config, send=send))
            self.assertEqual(second["sent"], 1)
            self.assertFalse(path.exists())
            self.assertEqual(report.await_count, 2)


if __name__ == "__main__":
    unittest.main()
