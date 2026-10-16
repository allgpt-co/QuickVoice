import asyncio
import base64
import io
import os
import sys
import unittest
import wave
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from livekit import rtc
from handlers import voice_samples
from handlers.voice_catalog import load_voice_catalog
from handlers.voice_config_resolution import VoiceConfigValidationError


class FakeStream:
    def __init__(self, frames, *, wait=False, error=None):
        self.frames, self.wait, self.error = frames, wait, error
        self.closed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        self.closed = True

    def __aiter__(self):
        return self.events()

    async def events(self):
        if self.wait:
            await asyncio.sleep(30)
        if self.error:
            raise self.error
        for frame in self.frames:
            yield SimpleNamespace(frame=frame)


class FakeTts:
    def __init__(self, stream):
        self.stream, self.closed, self.requests = stream, False, []

    def synthesize(self, text, *, conn_options):
        self.requests.append((text, conn_options))
        return self.stream

    async def aclose(self):
        self.closed = True


class VoiceSampleTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        voice_samples._cache.clear()
        voice_samples._slots = asyncio.Semaphore(2)
        self.catalog = load_voice_catalog()
        self.payload = {"language": "hi", "ttsModel": "elevenlabs/eleven_flash_v2_5", "voiceId": "UgBBYS2sOqTuMpoF3BR0"}
        self.frame = rtc.AudioFrame.create(24000, 1, 240)
        self.tts = FakeTts(FakeStream([self.frame]))
        self.builder = patch.object(voice_samples, "build_tts_adapter", return_value=self.tts).start()
        patch.object(voice_samples, "emit_metric").start()
        self.addCleanup(patch.stopall)

    async def test_selected_language_model_and_voice_generate_playable_wav(self):
        sample = await voice_samples.synthesize_voice_sample(self.payload, self.catalog)
        config, language = self.builder.call_args.args
        self.assertEqual((config["provider"], config["model"], config["voice"], language),
                         ("elevenlabs", "eleven_flash_v2_5", self.payload["voiceId"], "hi"))
        self.assertEqual(sample["sampleText"], "नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?")
        self.assertEqual(self.tts.requests[0][0], sample["sampleText"])
        self.assertEqual(self.tts.requests[0][1].max_retry, 0)
        with wave.open(io.BytesIO(base64.b64decode(sample["audioBase64"]))) as wav:
            self.assertEqual((wav.getframerate(), wav.getnchannels(), wav.getsampwidth()), (24000, 1, 2))
            self.assertEqual(wav.readframes(240), self.frame.data.tobytes())
        self.assertTrue(self.tts.closed and self.tts.stream.closed)

    async def test_identical_sample_is_cached_but_changes_generate_new_audio(self):
        for payload in [self.payload, self.payload,
                        {**self.payload, "voiceId": "EXAVITQu4vr4xnSDxMaL"},
                        {**self.payload, "ttsModel": "elevenlabs/eleven_turbo_v2_5"},
                        {**self.payload, "language": "en"}]:
            await voice_samples.synthesize_voice_sample(payload, self.catalog)
        self.assertEqual(self.builder.call_count, 4)

    async def test_invalid_combination_cannot_reach_provider(self):
        with self.assertRaises(VoiceConfigValidationError):
            await voice_samples.synthesize_voice_sample(
                {**self.payload, "ttsModel": "deepgram/aura-2"}, self.catalog)
        self.builder.assert_not_called()

    async def test_failed_and_empty_samples_are_not_cached_and_resources_close(self):
        for stream in [FakeStream([]), FakeStream([], error=RuntimeError("provider-secret"))]:
            self.tts = FakeTts(stream)
            self.builder.return_value = self.tts
            with self.assertRaises(voice_samples.VoiceSampleError) as caught:
                await voice_samples.synthesize_voice_sample(self.payload, self.catalog)
            self.assertNotIn("provider-secret", str(caught.exception))
            self.assertTrue(self.tts.closed and stream.closed)
            self.assertFalse(voice_samples._cache)

    async def test_oversized_audio_is_stopped_and_closed(self):
        self.tts.stream = FakeStream([self.frame] * 1600)
        with self.assertRaisesRegex(voice_samples.VoiceSampleError, "too long"):
            await voice_samples.synthesize_voice_sample(self.payload, self.catalog)
        self.assertTrue(self.tts.closed and self.tts.stream.closed)

    async def test_timeout_and_cancellation_close_the_provider(self):
        self.tts.stream = FakeStream([], wait=True)
        with patch.object(voice_samples, "SAMPLE_TIMEOUT_SECONDS", 0.02):
            with self.assertRaises(TimeoutError):
                await voice_samples.synthesize_voice_sample(self.payload, self.catalog)
        self.assertTrue(self.tts.closed and self.tts.stream.closed)
        self.tts = FakeTts(FakeStream([], wait=True))
        self.builder.return_value = self.tts
        task = asyncio.create_task(voice_samples.synthesize_voice_sample(self.payload, self.catalog))
        await asyncio.sleep(0)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(self.tts.closed and self.tts.stream.closed)

    async def test_cache_has_a_fixed_capacity_and_expiry(self):
        for index in range(20):
            await voice_samples.synthesize_voice_sample(self.payload, {**self.catalog, "version": str(index)})
        self.assertEqual(len(voice_samples._cache), 16)
        with patch.object(voice_samples, "time", SimpleNamespace(monotonic=lambda: float("inf"))):
            await voice_samples.synthesize_voice_sample(self.payload, self.catalog)
        self.assertEqual(len(voice_samples._cache), 1)


if __name__ == "__main__":
    unittest.main()
