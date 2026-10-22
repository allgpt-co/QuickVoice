"""Run the actual worker entrypoint with fake providers; no cloud/model startup."""
import ast
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock

ROOT = Path(__file__).resolve().parents[1]


def load_function(path, name, scope):
    tree = ast.parse(path.read_text())
    node = next(node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name)
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), "exec"), scope)
    return scope[name]


class Events:
    def __init__(self):
        self.handlers = {}

    def on(self, name):
        def register(handler):
            self.handlers[name] = handler
            return handler
        return register

    def emit(self, name, value):
        self.handlers[name](value)


class WorkerShutdownTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.room = Events()
        self.room.name = "test-room"
        self.room.remote_participants = {"caller": SimpleNamespace(identity="caller")}
        self.room.register_text_stream_handler = Mock()
        self.callbacks = []
        self.ctx = SimpleNamespace(room=self.room, job=SimpleNamespace(metadata="", id="job-1"),
                                   connect=AsyncMock(), shutdown=Mock(), add_shutdown_callback=self.callbacks.append)
        self.session = Events()
        self.session.usage = {"seconds": 10}
        self.session.start = AsyncMock()
        self.session.generate_reply = Mock()
        self.session.shutdown = Mock()
        self.reporter = SimpleNamespace(authorize=AsyncMock(return_value=True), close=AsyncMock(),
                                        start=AsyncMock(), mark_ended=Mock(), request_stop=AsyncMock())
        self.publisher = SimpleNamespace(start=AsyncMock(), close=AsyncMock(), publish_transcript=Mock())
        self.finalizer = SimpleNamespace(finalize=AsyncMock())
        self.limits = Mock()
        self.logger = Mock()
        async def consume(reader, **_kwargs):
            await reader.read_all()
        self.consume = AsyncMock(side_effect=consume)
        config = {"agent_id": "agent-1", "silence_end_call_timeout_seconds": 30,
                  "max_conversation_duration_seconds": 600}
        scope = {
            "asyncio": asyncio, "datetime": datetime, "timezone": timezone,
            "JobContext": object, "logger": self.logger, "redact_sensitive": lambda value: value,
            "is_voice_session_metadata": lambda _: False, "parse_metadata": lambda _: {},
            "wait_for_billed_participant": AsyncMock(return_value=(SimpleNamespace(identity="caller"), 0, datetime.now(timezone.utc))),
            "merge_participant_metadata": lambda metadata, _: metadata,
            "build_call_context": lambda *_: {"call_id": "call-1"},
            "get_config": AsyncMock(return_value=config),
            "apply_initiation_webhook_metadata": AsyncMock(return_value={}),
            "apply_metadata_overrides": lambda config, _: config,
            "attach_resolved_voice_config": lambda config: config,
            "build_session_provider_kwargs": lambda _: {}, "ivr_navigation_enabled": lambda *_: False,
            "AgentSession": Mock(return_value=self.session), "ProviderAdapterError": ValueError,
            "silero": Mock(), "TurnHandlingOptions": Mock(), "inference": Mock(),
            "BillingUsageIdentifiers": Mock(), "BillingUsageReporter": Mock(return_value=self.reporter),
            "selected_billing_model_ids": lambda _: {}, "attach_call_limits": Mock(return_value=self.limits),
            "LiveTranscriptPublisher": Mock(return_value=self.publisher), "TranscriptCollector": Mock(),
            "build_agent_instructions": lambda *_: "", "Assistant": Mock(),
            "consume_preview_user_transcript_stream": self.consume, "PREVIEW_TRANSCRIPT_TOPIC": "preview",
            "build_room_options": Mock(), "speak_first_message": Mock(),
            "should_store_call_audio": lambda _: False, "CallFinalizer": Mock(return_value=self.finalizer),
            "delete_call_room": AsyncMock(), "end_call_without_billing": AsyncMock(),
            "start_recording": AsyncMock(return_value="recording-1"),
            "build_recording_path": lambda value: f"recordings/{value}.ogg",
        }
        self.scope = scope
        load_function(ROOT / "handlers/worker_handler.py", "log_task_failure", scope)
        self.run_worker = load_function(ROOT / "main.py", "_run_entrypoint", scope)

    async def test_only_caller_disconnects_and_concurrent_shutdown_finalizes_once(self):
        await self.run_worker(self.ctx)
        self.assertEqual(len(self.callbacks), 1)
        for identity in ("observer", "agent", None):
            self.room.emit("participant_disconnected", SimpleNamespace(identity=identity))
        await asyncio.sleep(0)
        self.reporter.close.assert_not_called()
        self.reporter.mark_ended.assert_not_called()
        entered, release = asyncio.Event(), asyncio.Event()
        async def close(**_kwargs):
            entered.set()
            await release.wait()
        self.reporter.close.side_effect = close
        self.room.emit("participant_disconnected", SimpleNamespace(identity="caller"))
        self.room.emit("participant_disconnected", SimpleNamespace(identity="caller"))
        await entered.wait()
        waiter = asyncio.create_task(self.callbacks[0]())
        await asyncio.sleep(0)
        waiter.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await waiter
        release.set()
        await asyncio.gather(self.callbacks[0](), self.callbacks[0]())
        self.reporter.close.assert_awaited_once_with(final_usage=self.session.usage)
        self.reporter.mark_ended.assert_called_once()
        self.publisher.close.assert_awaited_once_with(reason="participant_disconnected")
        self.finalizer.finalize.assert_awaited_once()

    async def test_pending_speech_flushes_before_live_publisher_closes(self):
        await self.run_worker(self.ctx)
        collector = self.scope["TranscriptCollector"].return_value.attach.return_value
        events = []
        collector.flush.side_effect = lambda: events.append("speech")
        self.publisher.close.side_effect = lambda **_: events.append("closed")
        await self.callbacks[0]()
        self.assertEqual(events, ["speech", "closed"])
        collector.flush.assert_called_once()

    async def test_preview_tasks_observe_failures_and_shutdown_drains_pending_readers(self):
        await self.run_worker(self.ctx)
        stream = self.room.register_text_stream_handler.call_args.args[1]
        stream(SimpleNamespace(read_all=AsyncMock(side_effect=RuntimeError("reader failed"))), "caller")
        for _ in range(3):
            await asyncio.sleep(0)
        self.logger.error.assert_called_once()
        self.assertIn("reader failed", str(self.logger.error.call_args))
        started, cancelled = asyncio.Event(), asyncio.Event()
        async def read():
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        stream(SimpleNamespace(read_all=read), "caller")
        await started.wait()
        await self.callbacks[0]()
        self.assertTrue(cancelled.is_set())
        never_read = AsyncMock()
        stream(SimpleNamespace(read_all=never_read), "caller")
        await asyncio.sleep(0)
        never_read.assert_not_called()
        # Cancellation is normal teardown, not an error.
        self.logger.error.assert_called_once()

    async def test_start_failure_and_later_shutdown_share_cleanup(self):
        self.session.start.side_effect = RuntimeError("startup failed")
        with self.assertRaisesRegex(RuntimeError, "startup failed"):
            await self.run_worker(self.ctx)
        self.assertEqual(len(self.callbacks), 1)
        await self.callbacks[0]()
        self.reporter.close.assert_awaited_once()
        self.publisher.close.assert_awaited_once_with(reason="session_start_failed")
        self.finalizer.finalize.assert_not_called()

    async def test_shutdown_during_authorization_does_not_start_new_resources(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def authorize():
            entered.set()
            await release.wait()
            return True
        self.reporter.authorize.side_effect = authorize
        startup = asyncio.create_task(self.run_worker(self.ctx))
        await entered.wait()
        await self.callbacks[0]()
        release.set()
        await startup
        self.reporter.close.assert_awaited_once()
        self.session.start.assert_not_called()
        self.publisher.start.assert_not_called()

    async def test_authorization_failure_cleans_up_before_resources_exist(self):
        self.scope["should_store_call_audio"] = lambda _: True
        self.reporter.authorize.return_value = False
        await self.run_worker(self.ctx)
        self.assertEqual(len(self.callbacks), 1)
        await self.callbacks[0]()
        self.reporter.close.assert_awaited_once()
        self.limits.close.assert_called()
        self.publisher.start.assert_not_called()
        self.finalizer.finalize.assert_not_called()
        self.scope["start_recording"].assert_not_called()

    async def test_caller_already_gone_does_not_start_paid_processing(self):
        self.room.remote_participants.clear()
        await self.run_worker(self.ctx)
        self.scope["end_call_without_billing"].assert_awaited_once()
        self.reporter.authorize.assert_not_called()
        self.session.start.assert_not_called()

    async def test_disconnect_during_session_start_stops_before_greeting(self):
        async def start(**_kwargs):
            self.room.emit("participant_disconnected", SimpleNamespace(identity="caller"))
            await asyncio.sleep(0)
        self.session.start.side_effect = start
        await self.run_worker(self.ctx)
        await self.callbacks[0]()
        self.reporter.mark_ended.assert_called_once()
        self.reporter.close.assert_awaited_once()
        self.session.shutdown.assert_called()
        self.scope["speak_first_message"].assert_not_called()
        self.scope["start_recording"].assert_not_called()

    async def test_disconnect_during_billing_start_stops_before_greeting(self):
        async def start():
            self.room.emit("participant_disconnected", SimpleNamespace(identity="caller"))
            await asyncio.sleep(0)
        self.reporter.start.side_effect = start
        await self.run_worker(self.ctx)
        await self.callbacks[0]()
        self.reporter.close.assert_awaited_once()
        self.scope["speak_first_message"].assert_not_called()
        self.scope["start_recording"].assert_not_called()

    async def test_disconnect_during_recording_keeps_recording_in_one_final_call_log(self):
        self.scope["should_store_call_audio"] = lambda _: True
        async def record(_ctx):
            self.room.emit("participant_disconnected", SimpleNamespace(identity="caller"))
            await asyncio.sleep(0)
            return "recording-1"
        self.scope["start_recording"].side_effect = record
        await self.run_worker(self.ctx)
        await self.callbacks[0]()
        self.reporter.close.assert_awaited_once()
        self.finalizer.finalize.assert_awaited_once()
        self.assertEqual(self.scope["CallFinalizer"].call_args.kwargs["recording_path"], "recordings/recording-1.ogg")
        self.scope["delete_call_room"].assert_awaited_once()
        self.session.start.assert_not_called()
        self.scope["speak_first_message"].assert_not_called()

    async def test_recording_is_ready_before_session_and_first_message(self):
        self.scope["should_store_call_audio"] = lambda _: True
        entered, release = asyncio.Event(), asyncio.Event()
        async def record(_ctx):
            entered.set()
            await release.wait()
            return "recording-1"
        self.scope["start_recording"].side_effect = record
        startup = asyncio.create_task(self.run_worker(self.ctx))
        try:
            await asyncio.wait_for(entered.wait(), timeout=1)
            self.session.start.assert_not_called()
            self.scope["speak_first_message"].assert_not_called()
            self.scope["parse_preview_user_transcript_packet"] = Mock(return_value="early input")
            self.room.emit("data_received", SimpleNamespace())
            self.room.register_text_stream_handler.call_args.args[1](SimpleNamespace(), "caller")
            await asyncio.sleep(0)
            self.session.generate_reply.assert_not_called()
            self.consume.assert_not_called()
        finally:
            release.set()
            await startup
            await self.callbacks[0]()
        self.session.start.assert_awaited_once()
        self.scope["speak_first_message"].assert_called_once()

    async def test_zero_pii_call_does_not_wait_for_or_start_recording(self):
        from handlers.privacy_handler import should_store_call_audio
        self.scope["should_store_call_audio"] = should_store_call_audio
        self.scope["get_config"].return_value.update(
            store_call_audio=True, zero_pii_retention=True,
        )
        await self.run_worker(self.ctx)
        self.scope["start_recording"].assert_not_called()
        self.session.start.assert_awaited_once()
        self.scope["speak_first_message"].assert_called_once()

    async def test_session_shutdown_failure_does_not_skip_billing_or_call_log(self):
        await self.run_worker(self.ctx)
        self.session.shutdown.side_effect = RuntimeError("already closing")
        self.room.emit("participant_disconnected", SimpleNamespace(identity="caller"))
        await self.callbacks[0]()
        self.reporter.close.assert_awaited_once()
        self.publisher.close.assert_awaited_once()
        self.finalizer.finalize.assert_awaited_once()

    async def test_failed_recording_does_not_discard_final_call_log(self):
        self.scope["should_store_call_audio"] = lambda _: True
        self.scope["start_recording"].side_effect = RuntimeError("egress failed")
        await self.run_worker(self.ctx)
        self.scope["speak_first_message"].assert_called_once()
        await self.callbacks[0]()
        self.reporter.close.assert_awaited_once()
        self.finalizer.finalize.assert_awaited_once()
        self.assertIsNone(self.scope["CallFinalizer"].call_args.kwargs["recording_path"])

    async def test_hung_recording_is_cancelled_before_finalizing_call(self):
        self.scope["should_store_call_audio"] = lambda _: True
        entered = asyncio.Event()
        async def record(_ctx):
            entered.set()
            await asyncio.Future()
        self.scope["start_recording"].side_effect = record
        startup = asyncio.create_task(self.run_worker(self.ctx))
        await entered.wait()
        self.room.emit("participant_disconnected", SimpleNamespace(identity="caller"))
        await asyncio.wait_for(self.callbacks[0](), timeout=6)
        with self.assertRaises(asyncio.CancelledError):
            await startup
        self.reporter.close.assert_awaited_once()
        self.finalizer.finalize.assert_awaited_once()
        self.assertIsNone(self.scope["CallFinalizer"].call_args.kwargs["recording_path"])


if __name__ == "__main__":
    unittest.main()
