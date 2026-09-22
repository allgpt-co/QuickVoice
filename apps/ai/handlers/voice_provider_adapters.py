import logging
import os
from dataclasses import dataclass
from typing import Any

from aiobotocore.session import get_session
from livekit.plugins import aws, deepgram, elevenlabs, sarvam

logger = logging.getLogger("voice_provider_adapters")


class ProviderAdapterError(RuntimeError):
    pass


@dataclass(frozen=True)
class VoiceProviderAdapters:
    stt: Any
    llm: Any
    tts: Any
    summary: dict[str, str]


def build_voice_provider_adapters(config: dict[str, Any]) -> VoiceProviderAdapters:
    logger.info(
        "building voice provider adapters",
        extra={
            "stt_provider": config["stt"]["provider"],
            "llm_provider": config["llm"]["provider"],
            "tts_provider": config["tts"]["provider"],
            "language": config["language"],
        },
    )

    try:
        stt = _build_stt(
            config["stt"],
            config["stt"].get("language", config["language"]),
        )
        logger.info("stt adapter ready: %s/%s", config["stt"]["provider"], config["stt"]["model"])
    except Exception:
        logger.exception("failed to build STT adapter (provider=%s)", config["stt"].get("provider"))
        raise

    try:
        llm = _build_llm(config["llm"])
        logger.info("llm adapter ready: %s/%s", config["llm"]["provider"], config["llm"]["model"])
    except Exception:
        logger.exception("failed to build LLM adapter (provider=%s)", config["llm"].get("provider"))
        raise

    try:
        tts = _build_tts(config["tts"], config["language"])
        logger.info("tts adapter ready: %s/%s", config["tts"]["provider"], config["tts"]["model"])
    except Exception:
        logger.exception("failed to build TTS adapter (provider=%s)", config["tts"].get("provider"))
        raise

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
        region = os.getenv("AWS_REGION", "us-east-1")
        access_key = os.getenv("AWS_ACCESS_KEY_ID")
        secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        session_token = os.getenv("AWS_SESSION_TOKEN")

        kwargs: dict[str, Any] = {
            "model": config["model"],
            "region": region,
        }

        if access_key or secret_key or session_token:
            if not access_key:
                raise ProviderAdapterError(
                    "AWS_ACCESS_KEY_ID is required when AWS credentials are set"
                )
            if not secret_key:
                raise ProviderAdapterError(
                    "AWS_SECRET_ACCESS_KEY is required when AWS credentials are set"
                )

            if session_token:
                session = get_session()
                session.set_credentials(access_key, secret_key, session_token)
                session.set_config_variable("region", region)
                kwargs["session"] = session
            else:
                kwargs["api_key"] = access_key
                kwargs["api_secret"] = secret_key

        logger.info(
            "constructing bedrock LLM (model=%s, region=%s, using_explicit_creds=%s, has_session_token=%s)",
            kwargs.get("model"),
            region,
            "api_key" in kwargs or "session" in kwargs,
            bool(session_token),
        )
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