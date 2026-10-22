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
    def commit_user(self, collector, text, message_id="user-1"):
        collector.on_conversation_item_added(SimpleNamespace(
            item=SimpleNamespace(id=message_id, role="user", text_content=text)
        ))

    def test_split_speech_is_one_saved_and_published_turn(self):
        published = []
        collector = TranscriptCollector(on_item=published.append)
        parts = ["Can you tell me about the company and the service", "that it provides?"]
        for part in parts:
            collector.on_user_input_transcribed(SimpleNamespace(transcript=part, is_final=True))
        self.assertEqual(published, [])
        self.commit_user(collector, " ".join(parts))
        self.assertEqual([item["content"] for item in collector.read()], [" ".join(parts)])
        self.assertEqual(published, collector.read())

    def test_committed_correction_replaces_segments_without_text_matching(self):
        published = []
        collector = TranscriptCollector(on_item=published.append)
        for part in ["I want to book", "a flight to deli"]:
            collector.on_user_input_transcribed(SimpleNamespace(transcript=part, is_final=True))
        self.commit_user(collector, "I want to book a flight to Delhi.")
        self.assertEqual([item["content"] for item in collector.read()], ["I want to book a flight to Delhi."])
        self.assertEqual(published, collector.read())

    def test_repeated_confirmations_are_preserved_in_separate_turns(self):
        published = []
        collector = TranscriptCollector(on_item=published.append)
        for index in range(2):
            collector.on_user_input_transcribed(SimpleNamespace(transcript="Yes", is_final=True))
            self.commit_user(collector, "Yes", f"user-{index}")
        self.assertEqual([item["content"] for item in collector.read()], ["Yes", "Yes"])
        self.assertEqual(published, collector.read())

    def test_repeated_words_in_one_turn_are_not_discarded(self):
        collector = TranscriptCollector()
        for _ in range(2):
            collector.on_user_input_transcribed(SimpleNamespace(transcript="Yes", is_final=True))
        self.commit_user(collector, "Yes yes")
        self.assertEqual([item["content"] for item in collector.read()], ["Yes yes"])

    def test_uncommitted_speech_flushes_once_at_shutdown(self):
        published = []
        collector = TranscriptCollector(on_item=published.append)
        collector.on_user_input_transcribed(SimpleNamespace(transcript="Wait", is_final=True))
        self.assertEqual(published, [])
        collector.flush()
        collector.flush()
        self.assertEqual([item["content"] for item in collector.read()], ["Wait"])
        self.assertEqual(published, collector.read())

    def test_delayed_committed_turn_after_agent_speech_replaces_all_segments(self):
        published = []
        collector = TranscriptCollector(on_item=published.append)
        for part in ["Tell me about", "your service"]:
            collector.on_user_input_transcribed(SimpleNamespace(transcript=part, is_final=True))
        collector.on_agent_transcription_final("We provide customer support.")
        self.commit_user(collector, "Tell me about your service")
        self.assertEqual([item["role"] for item in collector.read()], ["user", "agent"])
        self.assertEqual(len(published), 2)
        self.assertEqual(published[-1]["id"], "user-1")

    def test_agent_speech_between_segments_does_not_duplicate_caller_turn(self):
        published = []
        collector = TranscriptCollector(on_item=published.append)
        collector.on_user_input_transcribed(SimpleNamespace(transcript="Tell me about", is_final=True))
        collector.on_agent_transcription_final("How can I help you?")
        collector.on_user_input_transcribed(SimpleNamespace(transcript="your service", is_final=True))
        self.commit_user(collector, "Tell me about your service")
        collector.flush()
        users = [item for item in collector.read() if item["role"] == "user"]
        self.assertEqual([item["content"] for item in users], ["Tell me about your service"])
        self.assertEqual(len(published), 2)

    def test_old_uncommitted_speech_is_not_stolen_by_a_later_turn(self):
        published = []
        collector = TranscriptCollector(on_item=published.append)
        collector.on_user_input_transcribed(SimpleNamespace(transcript="Yes", is_final=True))
        collector.on_agent_transcription_final("Please confirm the date.")
        self.commit_user(collector, "Tomorrow", "user-date")
        self.commit_user(collector, "Yes", "user-confirmation")
        collector.flush()
        self.assertEqual([item["content"] for item in collector.read()],
                         ["Yes", "Please confirm the date.", "Tomorrow", "Yes"])
        self.assertEqual(len(published), 4)
        self.assertEqual(len({item["id"] for item in published}), 4)

    def test_many_segments_and_multilingual_text_use_one_canonical_turn(self):
        published = []
        collector = TranscriptCollector(on_item=published.append)
        parts = ["मुझे", "आपकी", "कंपनी", "और", "सेवा", "के", "बारे", "में", "बताइए"]
        for part in parts:
            collector.on_user_input_transcribed(SimpleNamespace(transcript=part, is_final=True))
        self.commit_user(collector, " ".join(parts))
        collector.flush()
        self.assertEqual([item["content"] for item in collector.read()], [" ".join(parts)])
        self.assertEqual(published, collector.read())

    def test_reconciliation_does_not_reuse_live_message_ids(self):
        published = []
        collector = TranscriptCollector(on_item=published.append)
        for index in range(3):
            for part in ["Tell me", "something else"]:
                collector.on_user_input_transcribed(SimpleNamespace(transcript=part, is_final=True))
            self.commit_user(collector, "Tell me something else", f"user-{index}")
            collector.on_agent_transcription_final(f"Here is answer {index}.")
        self.assertEqual(len(published), 6)
        self.assertEqual(len({item["id"] for item in published}), 6)

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

    def test_repeated_final_user_transcripts_are_preserved_when_history_is_missing(self):
        activity = []
        collector = TranscriptCollector(on_user_activity=lambda: activity.append(True))
        collector.on_user_input_transcribed(
            SimpleNamespace(transcript="I need help", is_final=True, created_at=1704067202.0)
        )
        collector.on_user_input_transcribed(
            SimpleNamespace(transcript="I need help", is_final=True, created_at=1704067203.0)
        )

        self.assertEqual(len(collector.read()), 2)
        self.assertEqual(collector.read()[0]["role"], "user")
        self.assertEqual(collector.read()[0]["content"], "I need help")
        self.assertEqual(activity, [True, True])

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
