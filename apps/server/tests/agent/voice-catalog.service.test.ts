import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const originalFetch = globalThis.fetch;
const originalAiApiUrl = process.env.AI_API_URL;
const originalInternalApiKey = process.env.INTERNAL_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.AI_API_URL = originalAiApiUrl;
  process.env.INTERNAL_API_KEY = originalInternalApiKey;
});

test("getVoiceCatalog fetches the AI voice catalog with internal auth", async () => {
  process.env.AI_API_URL = "http://ai.local:5555";
  process.env.INTERNAL_API_KEY = "internal-key";
  const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers });
    return Response.json({
      version: "2026-06-30",
      defaults: {},
      languages: [{ id: "en", label: "English", locale: "en-US" }],
      timezones: ["UTC"],
      stt_models: [],
      llm_models: [],
      tts_models: [],
      voices: [],
    });
  };

  const { getVoiceCatalog } = await import("../../src/modules/agent/agent.service.js");

  const catalog = await getVoiceCatalog();

  assert.equal(catalog.version, "2026-06-30");
  assert.equal(calls[0]?.url, "http://ai.local:5555/voice/catalog");
  assert.deepEqual(calls[0]?.headers, { "x-internal-key": "internal-key" });
});

test("getVoiceCatalog reports AI catalog failures as service unavailable", async () => {
  process.env.AI_API_URL = "http://ai.local:5555";
  process.env.INTERNAL_API_KEY = "internal-key";
  globalThis.fetch = async () =>
    Response.json({ detail: "AI unavailable" }, { status: 503 });

  const { getVoiceCatalog } = await import("../../src/modules/agent/agent.service.js");

  await assert.rejects(() => getVoiceCatalog(), {
    message: "Voice catalog is unavailable",
    statusCode: 503,
  });
});

test("validateConfiguredVoice sends the exact saved locale, models, and voice to AI", async () => {
  process.env.AI_API_URL = "http://ai.local:5555";
  process.env.INTERNAL_API_KEY = "internal-key";
  let payload: Record<string, unknown> | undefined;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "http://ai.local:5555/voice/config/resolve");
    assert.equal(init?.method, "POST");
    payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ config: {} });
  };
  const { validateConfiguredVoice } = await import("../../src/modules/agent/agent.service.js");
  await validateConfiguredVoice({
    agent_language: "en-IN",
    timezone: "Asia/Kolkata",
    sttModel: "deepgram/nova-3",
    llmModel: "bedrock/us.amazon.nova-micro-v1:0",
    ttsModel: "elevenlabs/eleven_flash_v2_5",
    voiceId: "EXAVITQu4vr4xnSDxMaL",
  });
  assert.deepEqual(payload, {
    language: "en-IN",
    timezone: "Asia/Kolkata",
    stt: { provider: "deepgram", model: "nova-3" },
    llm: { provider: "bedrock", model: "us.amazon.nova-micro-v1:0" },
    tts: { provider: "elevenlabs", model: "eleven_flash_v2_5", voice: "EXAVITQu4vr4xnSDxMaL" },
  });
});

test("validateConfiguredVoice rejects combinations refused by the AI runtime", async () => {
  process.env.INTERNAL_API_KEY = "internal-key";
  globalThis.fetch = async () =>
    Response.json({ detail: "tts.model does not support language en-IN" }, { status: 400 });
  const { validateConfiguredVoice } = await import("../../src/modules/agent/agent.service.js");
  await assert.rejects(() => validateConfiguredVoice({
    agent_language: "en-IN",
    timezone: "UTC",
    sttModel: "deepgram/nova-3",
    llmModel: "bedrock/us.amazon.nova-micro-v1:0",
    ttsModel: "deepgram/aura-2",
    voiceId: "aura-2-asteria-en",
  }), { message: "tts.model does not support language en-IN", statusCode: 400 });
});
