import json
import os
from copy import deepcopy
from pathlib import Path


VOICE_SAMPLE_TEXT = {
    "en": "Hello! How can I help you today?",
    "en-IN": "Hello! How can I help you today?",
    "ar": "مرحباً! كيف يمكنني مساعدتك اليوم؟",
    "bg": "Здравейте! Как мога да ви помогна днес?",
    "zh": "您好！今天我能为您提供什么帮助？",
    "hr": "Pozdrav! Kako vam mogu pomoći danas?",
    "cs": "Dobrý den! Jak vám dnes mohu pomoci?",
    "da": "Hej! Hvordan kan jeg hjælpe dig i dag?",
    "nl": "Hallo! Hoe kan ik u vandaag helpen?",
    "fil": "Kumusta! Paano kita matutulungan ngayon?",
    "fi": "Hei! Kuinka voin auttaa sinua tänään?",
    "fr": "Bonjour ! Comment puis-je vous aider aujourd’hui ?",
    "de": "Hallo! Wie kann ich Ihnen heute helfen?",
    "el": "Γεια σας! Πώς μπορώ να σας βοηθήσω σήμερα;",
    "hi": "नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?",
    "hu": "Üdvözlöm! Miben segíthetek ma?",
    "id": "Halo! Apa yang bisa saya bantu hari ini?",
    "it": "Salve! Come posso aiutarla oggi?",
    "ja": "こんにちは！今日はどのようなお手伝いができますか？",
    "ko": "안녕하세요! 오늘 무엇을 도와드릴까요?",
    "ms": "Helo! Bagaimana saya boleh membantu anda hari ini?",
    "no": "Hei! Hvordan kan jeg hjelpe deg i dag?",
    "pl": "Dzień dobry! Jak mogę dziś pomóc?",
    "pt": "Olá! Como posso ajudar você hoje?",
    "ro": "Bună ziua! Cu ce vă pot ajuta astăzi?",
    "ru": "Здравствуйте! Чем я могу вам помочь сегодня?",
    "sk": "Dobrý deň! Ako vám dnes môžem pomôcť?",
    "es": "¡Hola! ¿Cómo puedo ayudarle hoy?",
    "sv": "Hej! Hur kan jag hjälpa dig idag?",
    "ta": "வணக்கம்! இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?",
    "tr": "Merhaba! Bugün size nasıl yardımcı olabilirim?",
    "uk": "Вітаю! Чим я можу вам допомогти сьогодні?",
    "vi": "Xin chào! Hôm nay tôi có thể giúp gì cho bạn?",
}


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
    "version": "2026-10-16",
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
    ],
}


def load_voice_catalog():
    catalog_path = os.getenv("VOICE_CATALOG_PATH")
    if catalog_path:
        catalog = json.loads(Path(catalog_path).read_text())
    else:
        catalog = deepcopy(STATIC_VOICE_CATALOG)
    for language in catalog["languages"]:
        # Sample content is fixed by the application, never supplied by the caller.
        language["sample_text"] = VOICE_SAMPLE_TEXT.get(language["id"])
    return catalog
