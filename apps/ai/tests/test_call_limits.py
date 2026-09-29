import asyncio
import os
import sys
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from livekit import api

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from handlers.billing_usage_reporter import BillingUsageIdentifiers, BillingUsageReporter
from handlers.worker_handler import attach_call_limits, delete_call_room, wait_for_sip_answer


class Events:
    def __init__(self):
        self.handlers = {}
        self.messages = []

    def on(self, name, handler):
        self.handlers.setdefault(name, []).append(handler)

    def off(self, name, handler):
        self.handlers[name].remove(handler)

    def emit(self, name, *args):
        for handler in list(self.handlers.get(name, [])):
            handler(*args)

    def say(self, text, **_kwargs):
        self.messages.append(text)


class CallLimitTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.queue = tempfile.TemporaryDirectory()
        self.addCleanup(self.queue.cleanup)

    async def test_room_deletion_propagates_failures_and_accepts_already_deleted(self):
        delete = AsyncMock(side_effect=RuntimeError("network unavailable"))
        ctx = SimpleNamespace(room=SimpleNamespace(name="call-room"),
                              api=SimpleNamespace(room=SimpleNamespace(delete_room=delete)))
        with self.assertRaisesRegex(RuntimeError, "network unavailable"):
            await delete_call_room(ctx)
        delete.side_effect = api.TwirpError(api.TwirpErrorCode.NOT_FOUND, "already deleted", status=404)
        await delete_call_room(ctx)
        self.assertEqual(delete.call_args.args[0].room, "call-room")
        delete.reset_mock()
        ctx.is_fake_job = lambda: True
        await delete_call_room(ctx)
        delete.assert_not_called()

    async def test_background_vad_activity_cannot_extend_meaningful_silence(self):
        session = Events()
        ended = asyncio.Event()
        reasons = []

        async def stop(reason):
            reasons.append(reason)
            ended.set()

        guard = attach_call_limits(
            session,
            silence_timeout_seconds=0.09,
            max_duration_seconds=600,
            connected_at_monotonic=time.monotonic(),
            stop_session=stop,
        )
        try:
            session.emit("agent_state_changed", SimpleNamespace(new_state="listening"))
            for state in ("speaking", "listening", "speaking", "listening"):
                await asyncio.sleep(0.015)
                session.emit("user_state_changed", SimpleNamespace(new_state=state))
            await asyncio.wait_for(ended.wait(), 1)
            self.assertEqual(reasons, ["silence_timeout"])
            self.assertEqual(session.messages, ["Are you still there?"])
        finally:
            guard.close()

    async def test_meaningful_activity_restarts_the_full_silence_window(self):
        session = Events()
        ended = asyncio.Event()

        async def stop(_reason):
            ended.set()

        guard = attach_call_limits(
            session,
            silence_timeout_seconds=0.12,
            max_duration_seconds=600,
            connected_at_monotonic=time.monotonic(),
            stop_session=stop,
        )
        try:
            session.emit("agent_state_changed", SimpleNamespace(new_state="listening"))
            await asyncio.sleep(0.06)
            guard.record_user_activity("transcript")
            await asyncio.sleep(0.06)
            self.assertFalse(ended.is_set())
            self.assertEqual(session.messages, [])
            await asyncio.wait_for(ended.wait(), 1)
            self.assertEqual(session.messages, ["Are you still there?"])
        finally:
            guard.close()

    async def test_agent_work_pauses_silence_before_the_warning(self):
        session = Events()
        ended = asyncio.Event()

        async def stop(_reason):
            ended.set()

        guard = attach_call_limits(
            session,
            silence_timeout_seconds=0.09,
            max_duration_seconds=600,
            connected_at_monotonic=time.monotonic(),
            stop_session=stop,
        )
        try:
            session.emit("agent_state_changed", SimpleNamespace(new_state="listening"))
            await asyncio.sleep(0.03)
            session.emit("agent_state_changed", SimpleNamespace(new_state="thinking"))
            await asyncio.sleep(0.1)
            self.assertFalse(ended.is_set())
            session.emit("agent_state_changed", SimpleNamespace(new_state="listening"))
            await asyncio.wait_for(ended.wait(), 1)
        finally:
            guard.close()

    async def test_repeated_agent_state_churn_does_not_reset_silence_window(self):
        session = Events()
        ended = asyncio.Event()
        reasons = []

        async def stop(reason):
            reasons.append(reason)
            ended.set()

        guard = attach_call_limits(
            session,
            silence_timeout_seconds=0.12,
            max_duration_seconds=600,
            connected_at_monotonic=time.monotonic(),
            stop_session=stop,
        )
        try:
            session.emit("agent_state_changed", SimpleNamespace(new_state="listening"))
            for _ in range(3):
                await asyncio.sleep(0.02)
                session.emit("agent_state_changed", SimpleNamespace(new_state="thinking"))
                await asyncio.sleep(0.005)
                session.emit("agent_state_changed", SimpleNamespace(new_state="listening"))
            await asyncio.wait_for(ended.wait(), 0.2)
            self.assertEqual(reasons, ["silence_timeout"])
            self.assertEqual(session.messages, ["Are you still there?"])
        finally:
            guard.close()

    async def test_warning_speech_does_not_restart_the_final_deadline(self):
        session = Events()
        ended = asyncio.Event()
        reasons = []

        def say(text, **_kwargs):
            session.messages.append(text)
            session.emit("agent_state_changed", SimpleNamespace(new_state="speaking"))
            session.emit("agent_state_changed", SimpleNamespace(new_state="listening"))

        session.say = say

        async def stop(reason):
            reasons.append(reason)
            ended.set()

        guard = attach_call_limits(
            session,
            silence_timeout_seconds=0.09,
            max_duration_seconds=600,
            connected_at_monotonic=time.monotonic(),
            stop_session=stop,
        )
        try:
            session.emit("agent_state_changed", SimpleNamespace(new_state="listening"))
            await asyncio.wait_for(ended.wait(), 1)
            self.assertEqual(reasons, ["silence_timeout"])
            self.assertEqual(session.messages, ["Are you still there?"])
        finally:
            guard.close()

    async def test_only_the_callers_dtmf_restarts_silence(self):
        session = Events()
        room = Events()
        ended = asyncio.Event()

        async def stop(_reason):
            ended.set()

        guard = attach_call_limits(
            session,
            room=room,
            participant_identity="caller",
            silence_timeout_seconds=0.12,
            max_duration_seconds=600,
            connected_at_monotonic=time.monotonic(),
            stop_session=stop,
        )
        try:
            session.emit("agent_state_changed", SimpleNamespace(new_state="listening"))
            await asyncio.sleep(0.06)
            room.emit(
                "sip_dtmf_received",
                SimpleNamespace(participant=SimpleNamespace(identity="other")),
            )
            await asyncio.sleep(0.03)
            self.assertEqual(session.messages, ["Are you still there?"])
            room.emit(
                "sip_dtmf_received",
                SimpleNamespace(participant=SimpleNamespace(identity="caller")),
            )
            await asyncio.sleep(0.06)
            self.assertFalse(ended.is_set())
        finally:
            guard.close()
        self.assertFalse(any(room.handlers.values()))

    async def test_silence_uses_retrying_hangup_even_while_billing_is_healthy(self):
        session = Events()
        ended = asyncio.Event()
        attempts = []

        async def hangup(reason):
            attempts.append(reason)
            session.emit("close", None)
            if len(attempts) == 1:
                raise RuntimeError("temporary room deletion failure")
            ended.set()

        reporter = BillingUsageReporter(
            identifiers=BillingUsageIdentifiers("call", "job", "room", "org"),
            server_api_url="https://example.invalid", internal_api_key="test",
            post_json=lambda *_: {"data": {"action": "continue"}},
            stop_session=hangup, required=True, retry_backoff_seconds=0,
            queue_dir=self.queue.name,
        )
        self.assertTrue(await reporter.authorize())
        guard = attach_call_limits(
            session,
            silence_timeout_seconds=0.03,
            max_duration_seconds=600,
            connected_at_monotonic=time.monotonic(),
            stop_session=reporter.request_stop,
        )
        session.emit("agent_state_changed", SimpleNamespace(new_state="listening"))
        await asyncio.wait_for(ended.wait(), 1)
        self.assertEqual(attempts, ["silence_timeout", "silence_timeout"])
        guard.close()
        await reporter.close()

    async def test_maximum_duration_fires_despite_speech_and_uses_original_start(self):
        session = Events()
        ended = asyncio.Event()
        reasons = []

        async def stop(reason):
            reasons.append(reason)
            ended.set()

        guard = attach_call_limits(session, max_duration_seconds=600,
                                   connected_at_monotonic=time.monotonic() - 601, stop_session=stop)
        session.emit("agent_state_changed", SimpleNamespace(new_state="speaking"))
        await asyncio.wait_for(ended.wait(), 1)
        self.assertEqual(reasons, ["max_call_duration"])
        guard.close()

    async def test_close_cancels_pending_duration_and_silence_handlers(self):
        session = Events()
        reasons = []

        async def stop(reason):
            reasons.append(reason)

        guard = attach_call_limits(session, max_duration_seconds=1,
                                   connected_at_monotonic=time.monotonic() - 2, stop_session=stop)
        guard.close()
        session.emit("agent_state_changed", SimpleNamespace(new_state="listening"))
        await asyncio.sleep(0.01)
        self.assertEqual(reasons, [])
        self.assertFalse(any(session.handlers.values()))

    async def test_agent_session_closing_also_hangs_up_the_phone(self):
        session = Events()
        reasons = []

        async def stop(reason):
            reasons.append(reason)

        attach_call_limits(session, max_duration_seconds=600,
                           connected_at_monotonic=time.monotonic(), stop_session=stop)
        session.emit("close", None)
        await asyncio.sleep(0)
        self.assertEqual(reasons, ["session_closed"])
        self.assertFalse(any(session.handlers.values()))

    async def test_ringing_is_not_a_connected_call_and_handlers_are_removed(self):
        room = Events()
        caller = SimpleNamespace(identity="caller", attributes={"sip.callStatus": "dialing"})
        wait = asyncio.create_task(wait_for_sip_answer(room, caller))
        await asyncio.sleep(0)
        self.assertFalse(wait.done())
        room.emit("participant_attributes_changed", {"sip.callStatus": "active"}, caller)
        await wait
        self.assertFalse(any(room.handlers.values()))

    async def test_sip_disconnect_before_answering_fails_and_cleans_up(self):
        room = Events()
        caller = SimpleNamespace(identity="caller", attributes={"sip.callStatus": "dialing"})
        wait = asyncio.create_task(wait_for_sip_answer(room, caller))
        await asyncio.sleep(0)
        room.emit("participant_disconnected", caller)
        with self.assertRaisesRegex(RuntimeError, "before answering"):
            await wait
        self.assertFalse(any(room.handlers.values()))

    async def test_answered_sip_calls_proceed_and_cancelled_waits_remove_listeners(self):
        for status in ("active", "automation"):
            room = Events()
            caller = SimpleNamespace(identity="caller", attributes={"sip.callStatus": status})
            await wait_for_sip_answer(room, caller)
            self.assertFalse(any(room.handlers.values()))
        room = Events()
        caller.attributes = {"sip.callStatus": "dialing"}
        with self.assertRaises(TimeoutError):
            await asyncio.wait_for(wait_for_sip_answer(room, caller), 0.01)
        self.assertFalse(any(room.handlers.values()))

    async def test_final_billing_duration_excludes_shutdown_and_retry_time(self):
        now = [100.0]
        requests = []

        def post(_url, _headers, payload):
            requests.append(payload)
            return {"data": {"action": "continue"}}

        reporter = BillingUsageReporter(
            identifiers=BillingUsageIdentifiers("call", "job", "room", "org"),
            server_api_url="https://example.invalid", internal_api_key="test",
            post_json=post, monotonic=lambda: now[0], required=True,
            queue_dir=self.queue.name,
        )
        now[0] = 130.0
        reporter.mark_ended()
        now[0] = 174.0
        await reporter.close()
        self.assertEqual(requests[-1]["connectedSeconds"], 30.0)
        self.assertTrue(requests[-1]["final"])
