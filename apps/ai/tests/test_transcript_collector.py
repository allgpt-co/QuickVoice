import unittest
from unittest.mock import patch
import os
import sys
from types import SimpleNamespace

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.transcript_collector import TranscriptCollector


class FakeSession:
    def __init__(self):
        self.handlers = {}

    def on(self, event, callback):
        self.handlers[event] = callback


class TranscriptCollectorTests(unittest.TestCase):
    def test_attach_registers_session_handlers_and_collects_conversation_items(self):
        session = FakeSession()
        collector = TranscriptCollector().attach(session)

        session.handlers["conversation_item_added"](
            SimpleNamespace(
                created_at=1704067200.0,
                item=SimpleNamespace(
                    id="assistant-1",
                    role="assistant",
                    text_content="Hello there",
                    created_at=1704067201.0,
                ),
            )
        )

        self.assertEqual(
            collector.read(),
            [{"id": "assistant-1", "role": "agent", "content": "Hello there", "time": 1704067201.0}],
        )

    def test_final_user_transcript_is_fallback_when_history_item_is_missing(self):
        activity = []
        collector = TranscriptCollector(on_user_activity=lambda: activity.append(True))
        collector.on_user_input_transcribed(
            SimpleNamespace(transcript="I need help", is_final=True, created_at=1704067202.0)
        )
        collector.on_user_input_transcribed(
            SimpleNamespace(transcript="I need help", is_final=True, created_at=1704067203.0)
        )

        self.assertEqual(len(collector.read()), 1)
        self.assertEqual(collector.read()[0]["role"], "user")
        self.assertEqual(collector.read()[0]["content"], "I need help")
        self.assertEqual(activity, [True])

    def test_committed_user_item_replaces_matching_stt_fallback(self):
        published = []
        collector = TranscriptCollector(on_item=published.append)
        collector.on_user_input_transcribed(
            SimpleNamespace(transcript="I need help", is_final=True, created_at=1704067202.0)
        )
        collector.on_conversation_item_added(
            SimpleNamespace(
                created_at=1704067203.0,
                item=SimpleNamespace(
                    id="user-committed-1",
                    role="user",
                    text_content="I need help",
                    created_at=1704067203.0,
                ),
            )
        )

        self.assertEqual(len(collector.read()), 1)
        self.assertEqual(collector.read()[0]["id"], "user-committed-1")
        self.assertEqual(len(published), 1)

    def test_committed_agent_item_replaces_early_transcription_turn(self):
        published = []
        collector = TranscriptCollector(on_item=published.append)
        collector.on_agent_transcription_final("How can I help?", time=1704067201.0)
        collector.on_conversation_item_added(
            SimpleNamespace(
                created_at=1704067202.0,
                item=SimpleNamespace(
                    id="agent-committed-1",
                    role="assistant",
                    text_content="How can I help?",
                    created_at=1704067202.0,
                ),
            )
        )

        self.assertEqual(len(collector.read()), 1)
        self.assertEqual(collector.read()[0]["id"], "agent-committed-1")
        self.assertEqual(len(published), 1)

    def test_user_stt_fallback_ignores_recent_agent_echo_fragment(self):
        activity = []
        collector = TranscriptCollector(on_user_activity=lambda: activity.append(True))
        collector.on_conversation_item_added(
            SimpleNamespace(
                created_at=1704067201.0,
                item=SimpleNamespace(
                    id="assistant-1",
                    role="assistant",
                    text_content=(
                        "Hi, thanks for calling, I can help answer questions, "
                        "capture details, or route the next step."
                    ),
                    created_at=1704067201.0,
                ),
            )
        )
        collector.on_user_input_transcribed(
            SimpleNamespace(
                transcript="Questions capture details or",
                is_final=True,
                created_at=1704067202.0,
            )
        )

        self.assertEqual(len(collector.read()), 1)
        self.assertEqual(collector.read()[0]["role"], "agent")
        self.assertEqual(activity, [])

    def test_committed_user_item_preserves_caller_repeating_agent_speech(self):
        collector = TranscriptCollector()
        collector.on_agent_transcription_final(
            "I'm here to assist you.", time=1704067201.0
        )
        collector.on_conversation_item_added(
            SimpleNamespace(
                created_at=1704067202.0,
                item=SimpleNamespace(
                    id="user-confirmation-1",
                    role="user",
                    text_content="I'm here to assist you.",
                    created_at=1704067202.0,
                ),
            )
        )

        self.assertEqual(
            collector.read(),
            [
                {
                    "id": "agent-transcript-0",
                    "role": "agent",
                    "content": "I'm here to assist you.",
                    "time": 1704067201.0,
                },
                {
                    "id": "user-confirmation-1",
                    "role": "user",
                    "content": "I'm here to assist you.",
                    "time": 1704067202.0,
                },
            ],
        )

    def test_notifies_live_publisher_only_for_new_final_items(self):
        published = []
        collector = TranscriptCollector(on_item=published.append)
        event = SimpleNamespace(
            created_at=1704067200.0,
            item=SimpleNamespace(
                id="agent-1",
                role="assistant",
                text_content="One answer",
                created_at=1704067201.0,
            ),
        )

        collector.on_conversation_item_added(event)
        collector.on_conversation_item_added(event)

        self.assertEqual(len(published), 1)
        self.assertEqual(published[0]["role"], "agent")
        self.assertEqual(published[0]["content"], "One answer")


if __name__ == "__main__":
    unittest.main()

class EchoWindowTests(unittest.TestCase):
    def test_repeated_agent_utterance_refreshes_window_but_later_confirmation_survives(self):
        collector = TranscriptCollector()
        phrase = "Your appointment is confirmed for tomorrow"
        with patch("handlers.transcript_collector.time.monotonic", return_value=10):
            collector.on_agent_transcription_final(phrase)
        with patch("handlers.transcript_collector.time.monotonic", return_value=100):
            collector.on_agent_transcription_final(phrase)
            collector.on_user_input_transcribed(SimpleNamespace(transcript=phrase, is_final=True))
        self.assertFalse(any(item["role"] == "user" for item in collector.read()))
        with patch("handlers.transcript_collector.time.monotonic", return_value=104):
            collector.on_user_input_transcribed(SimpleNamespace(transcript=phrase, is_final=True))
        self.assertEqual(collector.read()[-1]["role"], "user")
