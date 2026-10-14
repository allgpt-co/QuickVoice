import json
import os
from copy import deepcopy
from pathlib import Path


ELEVENLABS_FLASH_LANGUAGES = [
    {"id": "en", "label": "English", "locale": "en-US"},
    {"id": "ar", "label": "Arabic", "locale": "ar"},
    {"id": "bg", "label": "Bulgarian", "locale": "bg"},
    {"id": "zh", "label": "Chinese (Mandarin)", "locale": "zh-CN"},
    {"id": "hr", "label": "Croatian", "locale": "hr"},
    {"id": "cs", "label": "Czech", "locale": "cs"},
    {"id": "da", "label": "Danish", "locale": "da"},
    {"id": "nl", "label": "Dutch", "locale": "nl"},
    {"id": "fil", "label": "Filipino", "locale": "fil"},
    {"id": "fi", "label": "Finnish", "locale": "fi"},
    {"id": "fr", "label": "French", "locale": "fr"},
    {"id": "de", "label": "German", "locale": "de"},
    {"id": "el", "label": "Greek", "locale": "el"},
    {"id": "hi", "label": "Hindi", "locale": "hi-IN"},
    {"id": "hu", "label": "Hungarian", "locale": "hu"},
    {"id": "id", "label": "Indonesian", "locale": "id"},
    {"id": "it", "label": "Italian", "locale": "it"},
    {"id": "ja", "label": "Japanese", "locale": "ja"},
    {"id": "ko", "label": "Korean", "locale": "ko"},
    {"id": "ms", "label": "Malay", "locale": "ms"},
    {"id": "no", "label": "Norwegian", "locale": "no"},
    {"id": "pl", "label": "Polish", "locale": "pl"},
    {"id": "pt", "label": "Portuguese", "locale": "pt"},
    {"id": "ro", "label": "Romanian", "locale": "ro"},
    {"id": "ru", "label": "Russian", "locale": "ru"},
    {"id": "sk", "label": "Slovak", "locale": "sk"},
    {"id": "es", "label": "Spanish", "locale": "es"},
    {"id": "sv", "label": "Swedish", "locale": "sv"},
    {"id": "ta", "label": "Tamil", "locale": "ta"},
    {"id": "tr", "label": "Turkish", "locale": "tr"},
    {"id": "uk", "label": "Ukrainian", "locale": "uk"},
    {"id": "vi", "label": "Vietnamese", "locale": "vi"},
]
VOICE_LANGUAGES = ELEVENLABS_FLASH_LANGUAGES + [
    {"id": "en-IN", "label": "English (India)", "locale": "en-IN"},
]
VOICE_LANGUAGE_IDS = [language["id"] for language in VOICE_LANGUAGES]
NOVA_3_DIRECT_LANGUAGES = [language for language in VOICE_LANGUAGE_IDS if language != "hi"]
NOVA_3_MULTILINGUAL_LANGUAGES = ["en", "en-IN", "es", "fr", "de", "hi", "ru", "pt", "ja", "it", "nl"]


STATIC_VOICE_CATALOG = {
    "version": "2026-10-14",
    "defaults": {
        "language": "en",
        "timezone": "UTC",
        "stt": {"provider": "deepgram", "model": "nova-3"},
        "llm": {
            "provider": "bedrock",
            "model": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
            "fallback_model": "us.amazon.nova-micro-v1:0",
        },
        "tts": {
            "provider": "deepgram",
            "model": "aura-2",
            "voice": "aura-2-asteria-en",
        },
    },
    "languages": VOICE_LANGUAGES,
    "timezones": ["UTC", "Asia/Kolkata", "America/New_York", "America/Los_Angeles"],
    "stt_models": [
        {
            "provider": "deepgram",
            "id": "nova-3",
            "label": "Deepgram Nova-3",
            "languages": NOVA_3_DIRECT_LANGUAGES,
            "runtime_model": "nova-3",
            "billing_model": "deepgram/nova-3",
        },
        {
            "provider": "deepgram",
            "id": "nova-3-multilingual",
            "label": "Deepgram Nova-3 Multilingual",
            "languages": NOVA_3_MULTILINGUAL_LANGUAGES,
            "runtime_model": "nova-3",
            "runtime_language": "multi",
            "billing_model": "deepgram/nova-3-multilingual",
        },
        {
            "provider": "deepgram",
            "id": "nova-2",
            "label": "Deepgram Nova-2",
            "languages": ["en", "en-IN"],
            "runtime_model": "nova-2",
            "billing_model": "deepgram/nova-2",
        },
        {
            "provider": "sarvam",
            "id": "saaras:v3",
            "label": "Sarvam Saaras v3",
            "languages": ["hi", "en-IN"],
            "runtime_model": "saaras:v3",
            "billing_model": "sarvam/saaras:v3",
        },
    ],
    "llm_models": [
        {
            "provider": "bedrock",
            "id": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
            "label": "Claude Haiku 4.5",
            "runtime_model": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
            "billing_model": "bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0",
            "streaming": True,
        },
        {
            "provider": "bedrock",
            "id": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "label": "Claude Sonnet 4.5",
            "runtime_model": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "billing_model": "bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0",
            "streaming": True,
        },
        {
            "provider": "bedrock",
            "id": "us.amazon.nova-micro-v1:0",
            "label": "Amazon Nova Micro",
            "runtime_model": "us.amazon.nova-micro-v1:0",
            "billing_model": "bedrock/us.amazon.nova-micro-v1:0",
            "streaming": True,
        },
        {
            "provider": "bedrock",
            "id": "us.amazon.nova-lite-v1:0",
            "label": "Amazon Nova Lite",
            "runtime_model": "us.amazon.nova-lite-v1:0",
            "billing_model": "bedrock/us.amazon.nova-lite-v1:0",
            "streaming": True,
        },
    ],
    "tts_models": [
        {
            "provider": "deepgram",
            "id": "aura-2",
            "label": "Deepgram Aura-2",
            "languages": ["en"],
            "runtime_model": "aura-2",
            "billing_model": "deepgram/aura-2",
        },
        {
            "provider": "elevenlabs",
            "id": "eleven_flash_v2_5",
            "label": "ElevenLabs Flash v2.5",
            "languages": VOICE_LANGUAGE_IDS,
            "runtime_model": "eleven_flash_v2_5",
            "billing_model": "elevenlabs/eleven_flash_v2_5",
        },
        {
            "provider": "elevenlabs",
            "id": "eleven_turbo_v2_5",
            "label": "ElevenLabs Turbo v2.5",
            "languages": VOICE_LANGUAGE_IDS,
            "runtime_model": "eleven_turbo_v2_5",
            "billing_model": "elevenlabs/eleven_turbo_v2_5",
        },
        {
            "provider": "sarvam",
            "id": "bulbul:v3",
            "label": "Sarvam Bulbul v3",
            "languages": ["hi", "en-IN"],
            "runtime_model": "bulbul:v3",
            "billing_model": "sarvam/bulbul:v3",
        },
    ],
    "voices": [
        {
            "provider": "deepgram",
            "id": "aura-2-asteria-en",
            "label": "Asteria",
            "languages": ["en"],
            "tts_models": ["aura-2"],
            "runtime_voice": "aura-2-asteria-en",
        },
        {
            "provider": "deepgram",
            "id": "aura-2-athena-en",
            "label": "Athena",
            "languages": ["en"],
            "tts_models": ["aura-2"],
            "runtime_voice": "aura-2-athena-en",
        },
        {
            "provider": "deepgram",
            "id": "aura-2-apollo-en",
            "label": "Apollo",
            "languages": ["en"],
            "tts_models": ["aura-2"],
            "runtime_voice": "aura-2-apollo-en",
        },
        {
            "provider": "deepgram",
            "id": "aura-2-thalia-en",
            "label": "Thalia",
            "languages": ["en"],
            "tts_models": ["aura-2"],
            "runtime_voice": "aura-2-thalia-en",
        },
        {
            "provider": "elevenlabs",
            "id": "EXAVITQu4vr4xnSDxMaL",
            "label": "Sarah",
            "languages": VOICE_LANGUAGE_IDS,
            "tts_models": ["eleven_flash_v2_5", "eleven_turbo_v2_5"],
            "runtime_voice": "EXAVITQu4vr4xnSDxMaL",
        },
        {
            "provider": "elevenlabs",
            "id": "UgBBYS2sOqTuMpoF3BR0",
            "label": "Mark",
            "languages": VOICE_LANGUAGE_IDS,
            "tts_models": ["eleven_flash_v2_5", "eleven_turbo_v2_5"],
            "runtime_voice": "UgBBYS2sOqTuMpoF3BR0",
        },
        {
            "provider": "sarvam",
            "id": "shubh",
            "label": "Shubh",
            "languages": ["hi", "en-IN"],
            "tts_models": ["bulbul:v3"],
            "runtime_voice": "shubh",
        },
    ],
}


def load_voice_catalog():
    catalog_path = os.getenv("VOICE_CATALOG_PATH")
    if catalog_path:
        return json.loads(Path(catalog_path).read_text())
    return deepcopy(STATIC_VOICE_CATALOG)
