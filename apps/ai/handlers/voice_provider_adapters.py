import os
import warnings
from dataclasses import dataclass
from typing import Any

from livekit.plugins import deepgram, elevenlabs, sarvam


class ProviderAdapterError(RuntimeError):
    pass


@dataclass(frozen=True)
class VoiceProviderAdapters:
    stt: Any
    llm: Any
    tts: Any
    summary: dict[str, str]


def build_voice_provider_adapters(config: dict[str, Any]) -> VoiceProviderAdapters:
    stt = _build_stt(
        config["stt"],
        config["stt"].get("language", config["language"]),
    )
    llm = _build_llm(config["llm"])
    tts = _build_tts(config["tts"], config["language"])
    return VoiceProviderAdapters(
        stt=stt,
        llm=llm,
        tts=tts,
        summary={
            "stt_provider": config["stt"]["provider"],
            "stt_model": config["stt"]["model"],
            "llm_provider": config["llm"]["provider"],
            "llm_model": config["llm"]["model"],
            "tts_provider": config["tts"]["provider"],
            "tts_model": config["tts"]["model"],
            "tts_voice": config["tts"]["voice"],
        },
    )


def _build_stt(config: dict[str, Any], language: str):
    provider = config["provider"]
    model = config["model"]
    if provider == "deepgram":
        return deepgram.STT(
            model=model,
            language=_deepgram_language(language),
            api_key=_required_env("DEEPGRAM_API_KEY"),
        )
    if provider == "sarvam":
        return sarvam.STT(
            model=model,
            language=_sarvam_language(language),
            api_key=_required_env("SARVAM_API_KEY"),
        )
    raise ProviderAdapterError(f"unsupported STT provider: {provider}")


def _build_llm(config: dict[str, Any]):
    provider = config["provider"]
    if provider == "bedrock":
        aws = _aws_plugin()
        kwargs = {
            "model": config["model"],
            "region": os.getenv("AWS_REGION", "us-east-1"),
        }
        access_key = os.getenv("AWS_ACCESS_KEY_ID")
        secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        if access_key or secret_key:
            if not access_key:
                raise ProviderAdapterError("AWS_ACCESS_KEY_ID is required when AWS_SECRET_ACCESS_KEY is set")
            if not secret_key:
                raise ProviderAdapterError("AWS_SECRET_ACCESS_KEY is required when AWS_ACCESS_KEY_ID is set")
            kwargs["api_key"] = access_key
            kwargs["api_secret"] = secret_key
        return aws.LLM(**kwargs)
    raise ProviderAdapterError(f"unsupported LLM provider: {provider}")


def _build_tts(config: dict[str, Any], language: str):
    provider = config["provider"]
    model = config["model"]
    voice = config["voice"]
    if provider == "elevenlabs":
        return elevenlabs.TTS(
            model=model,
            voice_id=voice,
            language=_elevenlabs_language(language),
            api_key=_required_env("ELEVENLABS_API_KEY"),
        )
    if provider == "deepgram":
        return deepgram.TTS(
            model=voice or model,
            api_key=_required_env("DEEPGRAM_API_KEY"),
        )
    if provider == "sarvam":
        return sarvam.TTS(
            model=model,
            speaker=voice,
            target_language_code=_sarvam_language(language),
            api_key=_required_env("SARVAM_API_KEY"),
        )
    raise ProviderAdapterError(f"unsupported TTS provider: {provider}")


def _aws_plugin():
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="TranscribeStreamingClient is deprecated.*",
            category=DeprecationWarning,
        )
        from livekit.plugins import aws

    return aws


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ProviderAdapterError(f"{name} is required for the selected voice provider")
    return value


def _deepgram_language(language: str) -> str:
    return {
        "en": "en-US",
        "en-IN": "en-IN",
        "hi": "hi",
    }.get(language, language)


def _elevenlabs_language(language: str) -> str:
    return {
        "en": "en",
        "en-IN": "en",
        "hi": "hi",
    }.get(language, language)


def _sarvam_language(language: str) -> str:
    return {
        "en": "en-IN",
        "en-IN": "en-IN",
        "hi": "hi-IN",
    }.get(language, language)
