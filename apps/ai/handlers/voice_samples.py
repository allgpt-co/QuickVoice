import asyncio
import base64
import io
import json
import time
import wave
from collections import OrderedDict
from typing import Any

from livekit.agents import APIConnectOptions
from livekit.agents.utils import http_context

from handlers.voice_catalog import VOICE_SAMPLE_TEXT
from handlers.voice_config_resolution import VoiceConfigValidationError, resolve_tts_config
from handlers.voice_provider_adapters import ProviderAdapterError, build_tts_adapter
from utils.metrics import emit_metric

MAX_AUDIO_BYTES = 1_048_576
SAMPLE_TIMEOUT_SECONDS = 15
_slots = asyncio.Semaphore(2)
# ponytail: cache is per HTTP process, capped at 16 samples (~22 MiB encoded).
# Use shared Redis if cross-replica sample reuse is needed.
_cache: OrderedDict[str, tuple[float, dict[str, str]]] = OrderedDict()


class VoiceSampleError(RuntimeError):
    pass


async def synthesize_voice_sample(payload: dict[str, Any], catalog: dict[str, Any]) -> dict[str, str]:
    config = resolve_tts_config({
        "language": payload["language"],
        "tts": {"model": payload["ttsModel"], "voice": payload["voiceId"]},
    }, catalog)
    text = VOICE_SAMPLE_TEXT.get(config["language"])
    if not text:
        raise VoiceConfigValidationError("A sample sentence is not available for this language")
    key = json.dumps([catalog["version"], config, text], sort_keys=True)
    for expired in [key for key, (deadline, _) in _cache.items() if deadline <= time.monotonic()]:
        del _cache[expired]
    cached = _cache.get(key)
    if cached:
        _cache.move_to_end(key)
        return cached[1]

    async with asyncio.timeout(SAMPLE_TIMEOUT_SECONDS), _slots:
        # Recheck after waiting for another generation to finish.
        cached = _cache.get(key)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        async with http_context.open():
            try:
                tts = build_tts_adapter(config["tts"], config["language"])
            except ProviderAdapterError as exc:
                raise VoiceSampleError("The selected speech provider is not configured. Ask your administrator to check its API key.") from exc
            try:
                pcm = bytearray()
                audio_format = None
                async with tts.synthesize(text, conn_options=APIConnectOptions(max_retry=0, timeout=10)) as stream:
                    async for event in stream:
                        frame = event.frame
                        current_format = (frame.sample_rate, frame.num_channels)
                        if audio_format is None:
                            if not (8_000 <= frame.sample_rate <= 48_000 and 1 <= frame.num_channels <= 2):
                                raise VoiceSampleError("The speech provider returned an unsupported audio format")
                            audio_format = current_format
                        if current_format != audio_format:
                            raise VoiceSampleError("The speech provider changed audio format during the sample")
                        if len(pcm) + frame.data.nbytes > min(MAX_AUDIO_BYTES, frame.sample_rate * frame.num_channels * 2 * 15):
                            raise VoiceSampleError("The speech provider returned a sample that is too long")
                        pcm.extend(frame.data.tobytes())
                if not pcm or audio_format is None:
                    raise VoiceSampleError("The speech provider returned no audio. Please try again.")
            except VoiceSampleError:
                raise
            except Exception as exc:
                raise VoiceSampleError("Could not generate the selected voice sample. Check the provider configuration and try again.") from exc
            finally:
                await tts.aclose()
        audio = io.BytesIO()
        with wave.open(audio, "wb") as wav:
            wav.setsampwidth(2)
            wav.setframerate(audio_format[0])
            wav.setnchannels(audio_format[1])
            wav.writeframes(pcm)
        result = {"audioBase64": base64.b64encode(audio.getvalue()).decode("ascii"), "contentType": "audio/wav", "sampleText": text}
        _cache[key] = (time.monotonic() + 3600, result)
        while len(_cache) > 16:
            _cache.popitem(last=False)
        emit_metric("voice_sample_generated", provider=config["tts"]["provider"], model=config["tts"]["model"], characters=len(text))
        return result
