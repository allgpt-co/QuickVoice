import ast
import os
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from livekit import rtc
from livekit.agents import Agent, AgentSession, TurnHandlingOptions
from livekit.agents.voice.agent_activity import AgentActivity
from livekit.agents.voice.speech_handle import SpeechHandle


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MAIN_PATH = os.path.join(ROOT, "main.py")


class CallerBargeInTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Exercise the worker's actual session options with the installed SDK,
        # replacing providers only. No network, models, or billable calls.
        with open(MAIN_PATH, encoding="utf-8") as source:
            tree = ast.parse(source.read())
        call = next(node for node in ast.walk(tree) if isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Name) and node.func.id == "AgentSession")
        self.session = eval(compile(ast.Expression(call), MAIN_PATH, "eval"), {
            "AgentSession": AgentSession, "TurnHandlingOptions": TurnHandlingOptions,
            "provider_kwargs": {}, "config": {"ivr_navigation_enabled": False},
            "silero": SimpleNamespace(VAD=SimpleNamespace(load=lambda: Mock())),
            "inference": SimpleNamespace(TurnDetector=lambda: "vad"),
        })
        self.activity = AgentActivity(Agent(instructions="Test caller interruption"), self.session)
        self.activity._started = True
        self.recognition = Mock()
        self.recognition._endpointing.overlapping = True
        self.activity._audio_recognition = self.recognition
        self.session.output.audio = Mock(can_pause=False)
        self.session._update_agent_state("speaking")

    async def asyncTearDown(self):
        await self.session.aclose()

    def test_opening_words_reach_stt_during_greeting(self):
        frame = rtc.AudioFrame(data=b"\x01\x01" * 160, sample_rate=16000,
                               num_channels=1, samples_per_channel=160)
        self.activity.push_audio(frame)
        args, kwargs = self.recognition._push_audio.call_args
        received = kwargs["stt_frame"] if kwargs["stt_frame"] is not None else args[0]
        self.assertEqual(bytes(received.data), bytes(frame.data))

    def test_user_audio_is_preserved_during_a_protected_utterance(self):
        self.activity._current_speech = SpeechHandle.create(allow_interruptions=False)
        self.test_opening_words_reach_stt_during_greeting()

    def test_speech_interrupts_before_stt_has_recognized_any_words(self):
        speech = SpeechHandle.create(allow_interruptions=True)
        self.activity._current_speech = speech
        self.recognition._current_transcript = ""
        self.activity.on_vad_inference_done(SimpleNamespace(
            speech_duration=0.30, speaking=True, raw_accumulated_silence=0,
        ))
        self.assertTrue(speech.interrupted)

    def test_room_audio_pauses_immediately_on_caller_speech(self):
        # RoomIO supports pausing: the SDK pauses playout before deciding whether
        # to resume a false interruption, rather than waiting for final STT.
        self.session.output.audio.can_pause = True
        self.activity._current_speech = SpeechHandle.create(allow_interruptions=True)
        self.activity.on_vad_inference_done(SimpleNamespace(
            speech_duration=0.30, speaking=True, raw_accumulated_silence=0,
        ))
        self.session.output.audio.pause.assert_called_once()
        self.assertEqual(self.session.agent_state, "listening")

    def test_short_noise_burst_does_not_interrupt(self):
        speech = SpeechHandle.create(allow_interruptions=True)
        self.activity._current_speech = speech
        self.activity.on_vad_inference_done(SimpleNamespace(
            speech_duration=0.10, speaking=False, raw_accumulated_silence=0,
        ))
        self.assertFalse(speech.interrupted)


class LiveKitTurnHandlingTests(unittest.TestCase):
    def test_agent_session_turn_handling_does_not_pass_boolean_preemptive_generation(self):
        with open(MAIN_PATH, encoding="utf-8") as source:
            tree = ast.parse(source.read(), filename=MAIN_PATH)

        agent_sessions = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "AgentSession"
        ]

        self.assertGreaterEqual(len(agent_sessions), 1)

        for session_call in agent_sessions:
            turn_handling = next(
                (
                    keyword.value
                    for keyword in session_call.keywords
                    if keyword.arg == "turn_handling"
                ),
                None,
            )
            self.assertIsNotNone(turn_handling)
            self.assertIsInstance(turn_handling, ast.Call)
            self.assertIsInstance(turn_handling.func, ast.Name)
            self.assertEqual(turn_handling.func.id, "TurnHandlingOptions")

            option_names = {
                keyword.arg
                for keyword in turn_handling.keywords
                if keyword.arg is not None
            }
            self.assertIn("turn_detection", option_names)
            self.assertNotIn("preemptive_generation", option_names)


if __name__ == "__main__":
    unittest.main()
