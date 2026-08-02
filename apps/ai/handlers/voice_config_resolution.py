from typing import Any


class VoiceConfigValidationError(ValueError):
    pass


def resolve_voice_config(client_config: dict[str, Any], catalog: dict[str, Any]) -> dict[str, Any]:
    defaults = catalog["defaults"]
    language = _pick(client_config, "language", "agent_language") or defaults["language"]
    language = _catalog_language_id(language)
    timezone = client_config.get("timezone") or defaults["timezone"]

    if not _contains_id(catalog["languages"], language):
        raise VoiceConfigValidationError(f"language is not supported: {language}")
    if timezone not in catalog["timezones"]:
        raise VoiceConfigValidationError(f"timezone is not supported: {timezone}")

    stt_input = _section(client_config, "stt", defaults["stt"])
    stt_input = _language_sensitive_stt(stt_input, language)
    llm_input = _section(client_config, "llm", defaults["llm"])
    tts_input = _section(client_config, "tts", defaults["tts"])

    stt_model = _find_option(
        catalog["stt_models"],
        "stt.model",
        stt_input["provider"],
        stt_input["model"],
        language,
    )
    llm_model = _find_option(
        catalog["llm_models"],
        "llm.model",
        llm_input["provider"],
        llm_input["model"],
    )
    tts_model = _find_option(
        catalog["tts_models"],
        "tts.model",
        tts_input["provider"],
        tts_input["model"],
        language,
    )
    voice = _find_voice(
        catalog["voices"],
        provider=tts_input["provider"],
        voice_id=tts_input["voice"],
        tts_model_id=tts_input["model"],
        language=language,
    )

    return {
        "language": language,
        "timezone": timezone,
        "stt": {
            "provider": stt_model["provider"],
            "model": stt_model["runtime_model"],
            "language": stt_model.get("runtime_language", language),
            "billing_model": stt_model.get(
                "billing_model",
                f"{stt_model['provider']}/{stt_model['id']}",
            ),
        },
        "llm": {
            "provider": llm_model["provider"],
            "model": llm_model["runtime_model"],
            "streaming": bool(llm_model.get("streaming", False)),
            "billing_model": llm_model.get(
                "billing_model",
                f"{llm_model['provider']}/{llm_model['id']}",
            ),
        },
        "tts": {
            "provider": tts_model["provider"],
            "model": tts_model["runtime_model"],
            "voice": voice["runtime_voice"],
            "billing_model": tts_model.get(
                "billing_model",
                f"{tts_model['provider']}/{tts_model['id']}",
            ),
        },
    }


def _section(client_config: dict[str, Any], name: str, defaults: dict[str, str]) -> dict[str, str]:
    raw = client_config.get(name)
    merged = dict(defaults)
    if isinstance(raw, dict):
        merged.update({key: value for key, value in raw.items() if value is not None})
    else:
        legacy_model = client_config.get(f"{name}Model")
        if legacy_model:
            merged["model"] = legacy_model
    model = str(merged.get("model") or "").strip()
    if "/" in model:
        prefixed_provider, model = model.split("/", 1)
        configured_provider = (
            str(raw.get("provider") or "").strip()
            if isinstance(raw, dict)
            else ""
        )
        if configured_provider and configured_provider.lower() != prefixed_provider.lower():
            raise VoiceConfigValidationError(
                f"{name}.provider conflicts with model prefix {prefixed_provider}"
            )
        merged["provider"] = prefixed_provider.lower()
        merged["model"] = model
    return merged


def _language_sensitive_stt(
    stt_config: dict[str, str],
    language: str,
) -> dict[str, str]:
    if (
        language == "hi"
        and stt_config.get("provider") == "deepgram"
        and stt_config.get("model") in {"nova-3", "nova-3-general"}
    ):
        return {**stt_config, "model": "nova-3-multilingual"}
    return stt_config


def _pick(source: dict[str, Any], *keys: str):
    for key in keys:
        value = source.get(key)
        if value:
            return value
    return None


def _catalog_language_id(language: str) -> str:
    value = language.strip()
    return {
        "en-US": "en",
        "hi-IN": "hi",
    }.get(value, value)


def _contains_id(options: list[dict[str, Any]], option_id: str) -> bool:
    return any(option.get("id") == option_id for option in options)


def _find_option(
    options: list[dict[str, Any]],
    field_name: str,
    provider: str,
    option_id: str,
    language: str | None = None,
) -> dict[str, Any]:
    for option in options:
        if option["provider"] != provider or option["id"] != option_id:
            continue
        languages = option.get("languages")
        if language and languages and language not in languages:
            raise VoiceConfigValidationError(f"{field_name} does not support language {language}")
        return option
    raise VoiceConfigValidationError(f"{field_name} is not supported: {provider}/{option_id}")


def _find_voice(
    voices: list[dict[str, Any]],
    *,
    provider: str,
    voice_id: str,
    tts_model_id: str,
    language: str,
) -> dict[str, Any]:
    for voice in voices:
        if voice["provider"] != provider or not _voice_id_matches(voice, voice_id):
            continue
        if tts_model_id not in voice.get("tts_models", []):
            raise VoiceConfigValidationError(f"voice {voice_id} is not compatible with {tts_model_id}")
        if language not in voice.get("languages", []):
            raise VoiceConfigValidationError(f"voice {voice_id} does not support language {language}")
        return voice
    raise VoiceConfigValidationError(f"voice is not supported: {provider}/{voice_id}")


def _voice_id_matches(voice: dict[str, Any], requested_voice_id: str) -> bool:
    candidates = {str(voice.get("id", "")), str(voice.get("runtime_voice", ""))}
    for value in list(candidates):
        lower = value.lower()
        if lower.startswith("aura-2-") and lower.endswith("-en"):
            candidates.add(value[len("aura-2-") : -len("-en")])
    return requested_voice_id in candidates
