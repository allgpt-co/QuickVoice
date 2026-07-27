// Fallback catalog used while the runtime voice catalog is loading or
// unavailable. These IDs mirror the values accepted by the LiveKit worker.

import type { VoiceCatalog } from "@/src/lib/api/types";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "pt", label: "Portuguese" },
] as const;

const ALL_LANGUAGE_CODES = LANGUAGES.map((language) => language.code);

export type VoiceGender = "feminine" | "masculine" | "neutral";
export type LanguageCode = string;

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
}

export interface LanguageAwareModelOption extends ModelOption {
  languages: LanguageCode[];
}

export interface Voice {
  id: string;
  name: string;
  provider: string;
  gender: VoiceGender;
  locale: string;
  accent: string;
  languages: LanguageCode[];
  ttsModels: string[];
  styles: string[];
  useCases: string[];
}

export interface VoiceOptions {
  languages: Array<{ code: string; label: string }>;
  timezones: string[];
  sttModels: LanguageAwareModelOption[];
  llmModels: ModelOption[];
  ttsModels: LanguageAwareModelOption[];
  voices: Voice[];
}

export const VOICES: Voice[] = [
  {
    id: "aura-2-asteria-en",
    name: "Asteria",
    provider: "Deepgram",
    gender: "feminine",
    locale: "en-US",
    accent: "American",
    languages: ["en"],
    ttsModels: ["aura-2"],
    styles: ["Clear", "Confident", "Energetic"],
    useCases: ["Advertising", "Customer service"],
  },
  {
    id: "aura-2-apollo-en",
    name: "Apollo",
    provider: "Deepgram",
    gender: "masculine",
    locale: "en-US",
    accent: "American",
    languages: ["en"],
    ttsModels: ["aura-2"],
    styles: ["Confident", "Comfortable"],
    useCases: ["Casual chat"],
  },
  {
    id: "aura-2-hera-en",
    name: "Hera",
    provider: "Deepgram",
    gender: "feminine",
    locale: "en-US",
    accent: "American",
    languages: ["en"],
    ttsModels: ["aura-2"],
    styles: ["Smooth", "Warm", "Professional"],
    useCases: ["Informative"],
  },
  {
    id: "aura-2-zeus-en",
    name: "Zeus",
    provider: "Deepgram",
    gender: "masculine",
    locale: "en-US",
    accent: "American",
    languages: ["en"],
    ttsModels: ["aura-2"],
    styles: ["Deep", "Trustworthy", "Smooth"],
    useCases: ["IVR"],
  },
  {
    id: "aura-2-luna-en",
    name: "Luna",
    provider: "Deepgram",
    gender: "feminine",
    locale: "en-US",
    accent: "American",
    languages: ["en"],
    ttsModels: ["aura-2"],
    styles: ["Friendly", "Natural"],
    useCases: ["IVR"],
  },
  {
    id: "aura-2-draco-en",
    name: "Draco",
    provider: "Deepgram",
    gender: "masculine",
    locale: "en-GB",
    accent: "British",
    languages: ["en"],
    ttsModels: ["aura-2"],
    styles: ["Warm", "Trustworthy", "Baritone"],
    useCases: ["Storytelling"],
  },
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    provider: "ElevenLabs",
    gender: "feminine",
    locale: "en-US",
    accent: "American",
    languages: [...ALL_LANGUAGE_CODES],
    ttsModels: ["eleven-v3", "eleven-flash-v2.5", "eleven-turbo-v2.5"],
    styles: ["Calm", "Narrative", "Clear"],
    useCases: ["Customer service", "Narration"],
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    provider: "ElevenLabs",
    gender: "masculine",
    locale: "en-US",
    accent: "American",
    languages: [...ALL_LANGUAGE_CODES],
    ttsModels: ["eleven-v3", "eleven-flash-v2.5", "eleven-turbo-v2.5"],
    styles: ["Well-rounded", "Warm"],
    useCases: ["Conversational agents", "Narration"],
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Bella",
    provider: "ElevenLabs",
    gender: "feminine",
    locale: "en-US",
    accent: "American",
    languages: [...ALL_LANGUAGE_CODES],
    ttsModels: ["eleven-v3", "eleven-flash-v2.5", "eleven-turbo-v2.5"],
    styles: ["Soft", "Warm"],
    useCases: ["Customer service", "Conversational agents"],
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    provider: "ElevenLabs",
    gender: "masculine",
    locale: "en-US",
    accent: "American",
    languages: [...ALL_LANGUAGE_CODES],
    ttsModels: ["eleven-v3", "eleven-flash-v2.5", "eleven-turbo-v2.5"],
    styles: ["Deep", "Narrative"],
    useCases: ["IVR", "Narration"],
  },
  {
    id: "f786b574-daa5-4673-aa0c-cbe3e8534c02",
    name: "Katie",
    provider: "Cartesia",
    gender: "feminine",
    locale: "en-US",
    accent: "American",
    languages: [...ALL_LANGUAGE_CODES],
    ttsModels: ["sonic-3.5", "sonic-3", "sonic-2", "sonic-turbo"],
    styles: ["Stable", "Realistic"],
    useCases: ["Voice agents", "Customer service"],
  },
  {
    id: "a5136bf9-224c-4d76-b823-52bd5efcffcc",
    name: "Jameson",
    provider: "Cartesia",
    gender: "masculine",
    locale: "en-US",
    accent: "American",
    languages: [...ALL_LANGUAGE_CODES],
    ttsModels: ["sonic-3.5", "sonic-3", "sonic-2", "sonic-turbo"],
    styles: ["Stable", "Realistic"],
    useCases: ["Voice agents", "Customer service"],
  },
  {
    id: "228fca29-3a0a-435c-8728-5cb483251068",
    name: "Kiefer",
    provider: "Cartesia",
    gender: "masculine",
    locale: "en-US",
    accent: "American",
    languages: [...ALL_LANGUAGE_CODES],
    ttsModels: ["sonic-3.5", "sonic-3", "sonic-2", "sonic-turbo"],
    styles: ["Stable", "Conversational"],
    useCases: ["Voice agents", "Support"],
  },
  {
    id: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
    name: "Tessa",
    provider: "Cartesia",
    gender: "feminine",
    locale: "en-US",
    accent: "American",
    languages: [...ALL_LANGUAGE_CODES],
    ttsModels: ["sonic-3.5", "sonic-3", "sonic-2", "sonic-turbo"],
    styles: ["Expressive", "Emotive"],
    useCases: ["Companion apps", "Characters"],
  },
  {
    id: "astra",
    name: "Astra",
    provider: "Rime",
    gender: "feminine",
    locale: "en-US",
    accent: "American",
    languages: ["en"],
    ttsModels: ["rime-arcana", "rime-mist"],
    styles: ["Bright", "Expressive"],
    useCases: ["Voice agents", "Conversational agents"],
  },
  {
    id: "luna",
    name: "Luna",
    provider: "Rime",
    gender: "feminine",
    locale: "en-US",
    accent: "American",
    languages: ["en"],
    ttsModels: ["rime-arcana", "rime-mist"],
    styles: ["Bright", "Casual"],
    useCases: ["Voice agents", "Customer service"],
  },
  {
    id: "masonry",
    name: "Masonry",
    provider: "Rime",
    gender: "masculine",
    locale: "en-US",
    accent: "Southern",
    languages: ["en"],
    ttsModels: ["rime-arcana"],
    styles: ["Confident", "Low"],
    useCases: ["Professional agents", "Narration"],
  },
  {
    id: "cove",
    name: "Cove",
    provider: "Rime",
    gender: "feminine",
    locale: "en-US",
    accent: "American",
    languages: ["en"],
    ttsModels: ["rime-mist"],
    styles: ["Clear", "Natural"],
    useCases: ["Voice agents", "Customer service"],
  },
];

export function normalizeLanguageCode(language: string): LanguageCode {
  const normalized = language.trim().toLowerCase();
  const baseLanguage = normalized.split("-", 1)[0];
  const matched = LANGUAGES.find(
    (option) => option.code === normalized || option.code === baseLanguage,
  );

  return matched?.code ?? "en";
}

function supportsLanguage(
  option: { languages: LanguageCode[] },
  language: string,
) {
  return option.languages.includes(normalizeLanguageCode(language));
}

export function getVoicesForTtsModel(
  ttsModel: string,
  language = "en",
  options: VoiceOptions = STATIC_VOICE_OPTIONS,
) {
  return options.voices.filter(
    (voice) =>
      voice.ttsModels.includes(ttsModel) && supportsLanguage(voice, language),
  );
}

export function getDefaultVoiceForTtsModel(
  ttsModel: string,
  language = "en",
  options: VoiceOptions = STATIC_VOICE_OPTIONS,
) {
  return (
    getVoicesForTtsModel(ttsModel, language, options)[0]?.id ??
    options.voices[0]?.id ??
    ""
  );
}

export const LLM_MODELS: ModelOption[] = [
  // OpenAI
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", provider: "OpenAI" },
  { id: "gpt-5-nano", label: "GPT-5 Nano", provider: "OpenAI" },
  { id: "gpt-5-mini", label: "GPT-5 Mini", provider: "OpenAI" },
  { id: "gpt-5", label: "GPT-5", provider: "OpenAI" },

  // Anthropic
  { id: "claude-haiku-4.5", label: "Claude Haiku 4.5", provider: "Anthropic" },
  { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", provider: "Anthropic" },
  { id: "claude-sonnet-4", label: "Claude Sonnet 4", provider: "Anthropic" },
  { id: "claude-opus-4", label: "Claude Opus 4", provider: "Anthropic" },

  // Google Gemini
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    provider: "Google",
  },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google" },

  { id: "gemini-3-flash", label: "Gemini 3 Flash", provider: "Google" },

  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    provider: "Google",
  },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro", provider: "Google" },

  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "Google" },

  // DeepSeek
  { id: "deepseek-v3.1", label: "DeepSeek V3.1", provider: "DeepSeek" },

  // Moonshot AI
  { id: "kimi-k2.5", label: "Kimi K2.5", provider: "Moonshot AI" },

  // xAI
  { id: "grok-4", label: "Grok 4", provider: "xAI" },
];

export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export const STT_MODELS: LanguageAwareModelOption[] = [
  // Deepgram
  { id: "nova-3", label: "Nova-3", provider: "Deepgram", languages: ["en"] },
  { id: "nova-2", label: "Nova-2", provider: "Deepgram", languages: ["en"] },

  // AssemblyAI
  {
    id: "universal-streaming",
    label: "Universal Streaming",
    provider: "AssemblyAI",
    languages: [...ALL_LANGUAGE_CODES],
  },
  {
    id: "universal",
    label: "Universal",
    provider: "AssemblyAI",
    languages: [...ALL_LANGUAGE_CODES],
  },

  // Speechmatics
  {
    id: "speechmatics-standard",
    label: "Standard",
    provider: "Speechmatics",
    languages: [...ALL_LANGUAGE_CODES],
  },

  // ElevenLabs
  {
    id: "elevenlabs-scribe-v2",
    label: "Scribe v2",
    provider: "ElevenLabs",
    languages: [...ALL_LANGUAGE_CODES],
  },
];

export const TTS_MODELS: LanguageAwareModelOption[] = [
  // ElevenLabs
  {
    id: "eleven-v3",
    label: "Eleven v3",
    provider: "ElevenLabs",
    languages: [...ALL_LANGUAGE_CODES],
  },
  {
    id: "eleven-flash-v2.5",
    label: "Eleven Flash v2.5",
    provider: "ElevenLabs",
    languages: [...ALL_LANGUAGE_CODES],
  },
  {
    id: "eleven-turbo-v2.5",
    label: "Eleven Turbo v2.5",
    provider: "ElevenLabs",
    languages: [...ALL_LANGUAGE_CODES],
  },

  // Cartesia
  {
    id: "sonic-3.5",
    label: "Sonic 3.5",
    provider: "Cartesia",
    languages: [...ALL_LANGUAGE_CODES],
  },
  {
    id: "sonic-3",
    label: "Sonic 3",
    provider: "Cartesia",
    languages: [...ALL_LANGUAGE_CODES],
  },
  {
    id: "sonic-2",
    label: "Sonic 2",
    provider: "Cartesia",
    languages: [...ALL_LANGUAGE_CODES],
  },
  {
    id: "sonic-turbo",
    label: "Sonic Turbo",
    provider: "Cartesia",
    languages: [...ALL_LANGUAGE_CODES],
  },

  // Deepgram
  { id: "aura-2", label: "Aura-2", provider: "Deepgram", languages: ["en"] },

  // Rime
  { id: "rime-arcana", label: "Arcana", provider: "Rime", languages: ["en"] },
  { id: "rime-mist", label: "Mist", provider: "Rime", languages: ["en"] },
];

export const STATIC_VOICE_OPTIONS: VoiceOptions = {
  languages: [...LANGUAGES],
  timezones: [...COMMON_TIMEZONES],
  sttModels: [...STT_MODELS],
  llmModels: [...LLM_MODELS],
  ttsModels: [...TTS_MODELS],
  voices: [...VOICES],
};

function providerModelId(provider: string, id: string) {
  return `${provider}/${id}`;
}

function catalogLanguages(languages: string[] | undefined) {
  return languages?.length ? languages : ["en"];
}

export function buildVoiceOptionsFromCatalog(
  catalog: VoiceCatalog,
): VoiceOptions {
  return {
    languages: catalog.languages.map((language) => ({
      code: language.id,
      label: language.label,
    })),
    timezones: catalog.timezones,
    sttModels: catalog.stt_models.map((model) => ({
      id: providerModelId(model.provider, model.id),
      label: model.label,
      provider: model.provider,
      languages: catalogLanguages(model.languages),
    })),
    llmModels: catalog.llm_models.map((model) => ({
      id: providerModelId(model.provider, model.id),
      label: model.label,
      provider: model.provider,
    })),
    ttsModels: catalog.tts_models.map((model) => ({
      id: providerModelId(model.provider, model.id),
      label: model.label,
      provider: model.provider,
      languages: catalogLanguages(model.languages),
    })),
    voices: catalog.voices.map((voice) => ({
      id: voice.id,
      name: voice.label,
      provider: voice.provider,
      gender: "neutral",
      locale: voice.languages?.[0] ?? "en",
      accent: "",
      languages: catalogLanguages(voice.languages),
      ttsModels: (voice.tts_models ?? []).map((model) =>
        providerModelId(voice.provider, model),
      ),
      styles: [],
      useCases: [],
    })),
  };
}

export function getSttModelsForLanguage(
  language: string,
  options: VoiceOptions = STATIC_VOICE_OPTIONS,
) {
  return options.sttModels.filter((model) => supportsLanguage(model, language));
}

export function getTtsModelsForLanguage(
  language: string,
  options: VoiceOptions = STATIC_VOICE_OPTIONS,
) {
  return options.ttsModels.filter((model) => supportsLanguage(model, language));
}

export function getDefaultSttModelForLanguage(
  language: string,
  options: VoiceOptions = STATIC_VOICE_OPTIONS,
) {
  return (
    getSttModelsForLanguage(language, options)[0]?.id ??
    options.sttModels[0]?.id ??
    ""
  );
}

export function getDefaultTtsModelForLanguage(
  language: string,
  options: VoiceOptions = STATIC_VOICE_OPTIONS,
) {
  return (
    getTtsModelsForLanguage(language, options)[0]?.id ??
    options.ttsModels[0]?.id ??
    ""
  );
}
