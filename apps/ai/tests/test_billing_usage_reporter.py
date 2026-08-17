import asyncio
import math
import os
import sys
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.billing_usage_reporter import (  # noqa: E402
    BillingUsageIdentifiers,
    BillingUsageReporter,
    enqueue_billing_usage_snapshot,
    flush_billing_usage_queue,
    hosted_billing_required,
    response_requests_stop,
    run_billing_usage_queue_consumer,
    serialize_session_usage,
)


class FakePydanticUsage:
    def model_dump(self, *, mode="python"):
        assert mode == "json"
        return {
            "type": "llm_usage",
            "provider": "bedrock",
            "model": "claude-haiku",
            "input_tokens": 120,
            "output_tokens": 30,
            "ignored_none": None,
        }


@dataclass
class FakeDataclassUsage:
    type: str
    provider: str
    model: str
    characters_count: int
    audio_duration: float


class BillingUsageSerializationTests(unittest.TestCase):
    def test_serializes_livekit_style_usage_without_importing_livekit(self):
        usage = SimpleNamespace(
            model_usage=[
                FakePydanticUsage(),
                FakeDataclassUsage(
                    type="tts_usage",
                    provider="elevenlabs",
                    model="eleven_flash_v2_5",
                    characters_count=456,
                    audio_duration=12.25,
                ),
                {
                    "type": "stt_usage",
                    "provider": "deepgram",
                    "model": "nova-3",
                    "audio_duration": float("nan"),
                },
            ]
        )

        result = serialize_session_usage(usage)
        by_type = {item["type"]: item for item in result}

        self.assertEqual(by_type["llm_usage"]["input_tokens"], 120)
        self.assertNotIn("ignored_none", by_type["llm_usage"])
        self.assertEqual(by_type["tts_usage"]["characters_count"], 456)
        self.assertEqual(by_type["tts_usage"]["audio_duration"], 12.25)
        self.assertTrue(math.isfinite(by_type["stt_usage"]["audio_duration"]))

    def test_serialization_is_stably_sorted_and_accepts_camel_case_container(self):
        result = serialize_session_usage(
            {
                "modelUsage": [
                    {"type": "tts_usage", "provider": "z", "model": "voice"},
                    {"type": "llm_usage", "provider": "a", "model": "chat"},
                ]
            }
        )

        self.assertEqual(
            [(item["type"], item["provider"]) for item in result],
            [("llm_usage", "a"), ("tts_usage", "z")],
        )

    def test_serialization_applies_canonical_catalog_model_ids(self):
        result = serialize_session_usage(
            {
                "modelUsage": [
                    {
                        "type": "stt_usage",
                        "provider": "deepgram",
                        "model": "nova-3",
                        "audio_duration": 2.5,
                    }
                ]
            },
            canonical_model_ids={"stt": "deepgram/nova-3-multilingual"},
        )

        self.assertEqual(result[0]["model"], "deepgram/nova-3-multilingual")
        self.assertEqual(result[0]["provider"], "deepgram")

    def test_billing_mode_defaults_to_hosted_only_in_production(self):
        with patch.dict(os.environ, {"NODE_ENV": "production"}, clear=True):
            self.assertTrue(hosted_billing_required())
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(hosted_billing_required())
        with patch.dict(
            os.environ,
            {"NODE_ENV": "production", "QUICKVOICE_BILLING_MODE": "self_hosted"},
            clear=True,
        ):
            self.assertFalse(hosted_billing_required())

    def test_stop_response_supports_envelope_402_and_legacy_denial_shapes(self):
        self.assertEqual(
            response_requests_stop(
                {"success": True, "data": {"action": "stop", "reason": "insufficient_funds"}}
            ),
            "insufficient_funds",
        )
        self.assertEqual(
            response_requests_stop({"statusCode": 402, "message": "Wallet depleted"}),
            "Wallet depleted",
        )
        self.assertEqual(
            response_requests_stop({"data": {"allowed": False}}),
            "insufficient_funds",
        )
        self.assertIsNone(response_requests_stop({"data": {"action": "continue"}}))


class BillingUsageReporterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.now = 100.0
        self.identifiers = BillingUsageIdentifiers(
            call_id="call-123",
            session_id="job-456",
            room_name="room-789",
            organization_id="org-1",
            user_id="user-2",
            agent_id="agent-3",
            telephony_provider="TWILIO",
            provider_call_id="CA-provider-call-4",
        )

    def make_reporter(self, post_json, **kwargs):
        kwargs.setdefault("queue_dir", "/var/lib/quickvoice-test-billing-usage")
        return BillingUsageReporter(
            identifiers=self.identifiers,
            server_api_url="https://api.quickvoice.example/api/v1",
            internal_api_key="internal-secret",
            post_json=post_json,
            monotonic=lambda: self.now,
            retry_backoff_seconds=0,
            required=True,
            **kwargs,
        )

    async def test_hosted_reporting_requires_an_explicit_absolute_durable_queue(self):
        stop_reasons = []

        reporter = BillingUsageReporter(
            identifiers=self.identifiers,
            server_api_url="https://api.quickvoice.example/api/v1",
            internal_api_key="internal-secret",
            post_json=lambda *_args: {"data": {"action": "continue"}},
            stop_session=lambda reason: stop_reasons.append(reason),
            required=True,
            queue_dir="",
        )

        self.assertFalse(reporter.enabled)
        self.assertFalse(await reporter.authorize())

        self.assertEqual(stop_reasons, ["billing_configuration_missing"])

    async def test_reports_cumulative_usage_with_monotonic_sequence_and_stable_idempotency(self):
        requests = []

        async def post_json(url, headers, body):
            requests.append((url, dict(headers), dict(body)))
            return {"success": True, "data": {"action": "continue"}}

        reporter = self.make_reporter(post_json)
        reporter.update_usage(
            {"model_usage": [{"type": "llm_usage", "provider": "bedrock", "model": "nova", "input_tokens": 5}]}
        )

        await reporter.report_now()
        self.now += 12.3456
        await reporter.report_now(final=True)

        first_url, first_headers, first_body = requests[0]
        _, second_headers, second_body = requests[1]
        self.assertEqual(first_url, "https://api.quickvoice.example/api/v1/billing/calls/usage")
        self.assertEqual(first_headers["Authorization"], "Bearer internal-secret")
        self.assertEqual(first_headers["x-organization-id"], "org-1")
        self.assertEqual(first_headers["x-user-id"], "user-2")
        self.assertEqual(first_body["sequence"], 1)
        self.assertEqual(first_body["connectedSeconds"], 0.0)
        self.assertFalse(first_body["final"])
        self.assertEqual(second_body["sequence"], 2)
        self.assertEqual(second_body["connectedSeconds"], 12.346)
        self.assertTrue(second_body["final"])
        self.assertEqual(second_body["modelUsage"][0]["input_tokens"], 5)
        self.assertEqual(second_body["telephonyProvider"], "TWILIO")
        self.assertEqual(second_body["providerCallId"], "CA-provider-call-4")
        self.assertNotEqual(first_headers["Idempotency-Key"], second_headers["Idempotency-Key"])

    async def test_retries_same_snapshot_sequence_and_idempotency_key(self):
        requests = []

        async def flaky_post(url, headers, body):
            requests.append((headers["Idempotency-Key"], body["sequence"]))
            if len(requests) < 3:
                raise OSError("temporary network failure")
            return {"data": {"action": "continue"}}

        reporter = self.make_reporter(flaky_post, retry_attempts=3)

        sent = await reporter.report_now()

        self.assertTrue(sent)
        self.assertEqual([sequence for _, sequence in requests], [1, 1, 1])
        self.assertEqual(len({key for key, _ in requests}), 1)

    async def test_stop_response_invokes_graceful_termination_once(self):
        stop_reasons = []

        async def post_json(_url, _headers, _body):
            return {"success": True, "data": {"action": "stop", "reason": "insufficient_funds"}}

        async def stop_session(reason):
            stop_reasons.append(reason)

        reporter = self.make_reporter(post_json, stop_session=stop_session)

        await reporter.report_now()
        await reporter.report_now()

        self.assertEqual(stop_reasons, ["insufficient_funds"])
        self.assertTrue(reporter.stop_requested)

    async def test_termination_watchdog_retries_a_failed_shutdown_callback(self):
        attempts = []

        async def post_json(_url, _headers, _body):
            return {"data": {"action": "stop", "reason": "depleted"}}

        async def flaky_stop(reason):
            attempts.append(reason)
            if len(attempts) < 3:
                raise RuntimeError("transient room shutdown failure")

        reporter = self.make_reporter(
            post_json,
            stop_session=flaky_stop,
            termination_retry_attempts=3,
            termination_timeout_seconds=0.1,
        )

        await reporter.report_now()

        self.assertEqual(attempts, ["depleted", "depleted", "depleted"])
        self.assertTrue(reporter.stop_requested)

    async def test_periodic_reporter_exception_fails_closed(self):
        stop_reasons = []
        reporter = self.make_reporter(
            lambda *_args: {"data": {"action": "continue"}},
            stop_session=lambda reason: stop_reasons.append(reason),
        )

        async def broken_authorize():
            raise RuntimeError("unexpected reporter failure")

        reporter.authorize = broken_authorize
        await reporter._periodic_loop()

        self.assertEqual(stop_reasons, ["billing_reporter_failed"])

    async def test_initial_authorization_failure_refuses_paid_processing(self):
        stop_reasons = []

        async def unavailable(*_args):
            raise OSError("billing backend unavailable")

        reporter = self.make_reporter(
            unavailable,
            stop_session=lambda reason: stop_reasons.append(reason),
            retry_attempts=1,
        )

        self.assertFalse(await reporter.authorize())
        self.assertEqual(stop_reasons, ["billing_reporting_unavailable"])
        self.assertTrue(reporter.stop_requested)

    async def test_reporting_gap_stops_before_sixty_second_reserve_expires(self):
        stop_reasons = []
        available = True

        async def post_json(*_args):
            if not available:
                raise OSError("billing backend unavailable")
            return {"data": {"action": "continue"}}

        reporter = self.make_reporter(
            post_json,
            stop_session=lambda reason: stop_reasons.append(reason),
            retry_attempts=1,
            max_reporting_gap_seconds=50,
        )
        self.assertTrue(await reporter.authorize())

        available = False
        self.now += 49
        self.assertFalse(await reporter.report_now())
        self.assertEqual(stop_reasons, [])

        self.now += 1
        self.assertFalse(await reporter.report_now())
        self.assertEqual(stop_reasons, ["billing_reporting_unavailable"])

    async def test_stop_on_final_snapshot_does_not_reenter_session_shutdown(self):
        stop_reasons = []

        async def post_json(_url, _headers, _body):
            return {"data": {"action": "stop", "reason": "final_balance_exhausted"}}

        async def stop_session(reason):
            stop_reasons.append(reason)

        reporter = self.make_reporter(post_json, stop_session=stop_session)

        await reporter.report_now(final=True)

        self.assertTrue(reporter.stop_requested)
        self.assertEqual(stop_reasons, [])

    async def test_periodic_sender_runs_off_the_event_callback_and_close_sends_final_snapshot(self):
        request_started = asyncio.Event()
        release_request = asyncio.Event()
        requests = []

        async def slow_post(_url, _headers, body):
            requests.append(dict(body))
            request_started.set()
            await release_request.wait()
            return {"data": {"action": "continue"}}

        reporter = self.make_reporter(slow_post, interval_seconds=0.01)
        reporter.update_usage({"model_usage": []})

        await reporter.start()
        await asyncio.wait_for(request_started.wait(), timeout=0.2)
        # Updating cumulative usage is synchronous and cannot be delayed by billing I/O.
        reporter.update_usage(
            {"model_usage": [{"type": "stt_usage", "provider": "deepgram", "model": "nova-3", "audio_duration": 2.0}]}
        )
        release_request.set()
        self.now += 2.0
        await reporter.close()

        self.assertTrue(any(request["final"] for request in requests))
        final_request = next(request for request in requests if request["final"])
        self.assertEqual(final_request["modelUsage"][0]["audio_duration"], 2.0)

    async def test_missing_hosted_credentials_disables_reporting_without_network_calls(self):
        calls = []

        async def post_json(*args):
            calls.append(args)

        reporter = BillingUsageReporter(
            identifiers=self.identifiers,
            server_api_url="",
            internal_api_key="",
            post_json=post_json,
            required=False,
        )

        await reporter.start()
        self.assertFalse(await reporter.report_now())
        await reporter.close()
        self.assertFalse(reporter.enabled)
        self.assertEqual(calls, [])

    async def test_failed_final_snapshot_is_queued_and_flushed_durably(self):
        async def unavailable(*_args):
            raise OSError("billing backend unavailable")

        with tempfile.TemporaryDirectory() as tmp:
            reporter = self.make_reporter(
                unavailable,
                retry_attempts=1,
                queue_dir=tmp,
            )
            reporter.update_usage(
                {
                    "model_usage": [
                        {
                            "type": "stt_usage",
                            "provider": "deepgram",
                            "model": "nova-3",
                            "audio_duration": 3,
                        }
                    ]
                }
            )

            await reporter.close()
            queued = list(Path(tmp).glob("*.json"))
            self.assertEqual(len(queued), 1)
            envelope = __import__("json").loads(queued[0].read_text())
            self.assertTrue(envelope["payload"]["final"])
            self.assertNotIn("Authorization", envelope)

            posted = []

            async def post_json(url, headers, body):
                posted.append((url, headers, body))
                return {"data": {"action": "continue"}}

            result = await flush_billing_usage_queue(
                queue_dir=tmp,
                server_api_url="https://api.quickvoice.example/api/v1",
                internal_api_key="replacement-secret",
                post_json=post_json,
            )

            self.assertEqual(result, {"posted": 1, "failed": 0, "dead_lettered": 0})
            self.assertEqual(posted[0][1]["Authorization"], "Bearer replacement-secret")
            self.assertTrue(posted[0][2]["final"])
            self.assertEqual(list(Path(tmp).glob("*.json")), [])

    async def test_missing_creator_uses_service_actor_header_without_payload_attribution(self):
        requests = []
        identifiers = BillingUsageIdentifiers(
            call_id="call-org-owned",
            session_id="job-org-owned",
            room_name="room-org-owned",
            organization_id="org-1",
        )
        reporter = BillingUsageReporter(
            identifiers=identifiers,
            server_api_url="https://api.quickvoice.example/api/v1",
            internal_api_key="internal-secret",
            post_json=lambda url, headers, body: requests.append(
                (url, dict(headers), dict(body))
            )
            or {"data": {"action": "continue"}},
            required=True,
            queue_dir="/var/lib/quickvoice-test-billing-usage",
        )

        await reporter.report_now()

        self.assertEqual(requests[0][1]["x-user-id"], "system:voice-worker")
        self.assertNotIn("userId", requests[0][2])

    async def test_continuous_consumer_drains_queue_without_a_new_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            enqueue_billing_usage_snapshot(
                {
                    "callId": "call-queued",
                    "sessionId": "session-queued",
                    "roomName": "room-queued",
                    "organizationId": "org-1",
                    "sequence": 7,
                    "connectedSeconds": 12,
                    "modelUsage": [],
                    "final": True,
                },
                queue_dir=tmp,
            )
            delivered = []
            stop_event = asyncio.Event()

            async def post_json(_url, headers, body):
                delivered.append((headers, body))
                stop_event.set()
                return {"data": {"action": "continue"}}

            await asyncio.wait_for(
                run_billing_usage_queue_consumer(
                    queue_dir=tmp,
                    server_api_url="https://api.quickvoice.example/api/v1",
                    internal_api_key="internal-secret",
                    post_json=post_json,
                    poll_seconds=0.01,
                    stop_event=stop_event,
                ),
                timeout=0.5,
            )

            self.assertEqual(len(delivered), 1)
            self.assertEqual(
                delivered[0][0]["x-user-id"], "system:voice-worker"
            )
            self.assertEqual(list(Path(tmp).glob("*.json*")), [])


if __name__ == "__main__":
    unittest.main()
