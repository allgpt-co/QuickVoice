import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadVoicesModule() {
  const source = readFileSync(join(root, "src/lib/data/voices.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const cjsModule = { exports: {} };

  vm.runInNewContext(compiled, {
    exports: cjsModule.exports,
    module: cjsModule,
  });

  return cjsModule.exports;
}

test("buildVoiceOptionsFromCatalog maps AI catalog values to console dropdown options", () => {
  const { buildVoiceOptionsFromCatalog } = loadVoicesModule();

  const options = buildVoiceOptionsFromCatalog({
    version: "2026-06-30",
    defaults: {},
    languages: [{ id: "en-IN", label: "English (India)", locale: "en-IN" }],
    timezones: ["UTC", "Asia/Kolkata"],
    stt_models: [
      {
        provider: "deepgram",
        id: "nova-3",
        label: "Deepgram Nova-3",
        languages: ["en-IN"],
      },
    ],
    llm_models: [
      {
        provider: "bedrock",
        id: "us.amazon.nova-lite-v1:0",
        label: "Amazon Nova Lite",
      },
    ],
    tts_models: [
      {
        provider: "elevenlabs",
        id: "eleven_flash_v2_5",
        label: "ElevenLabs Flash v2.5",
        languages: ["en-IN"],
      },
    ],
    voices: [
      {
        provider: "elevenlabs",
        id: "EXAVITQu4vr4xnSDxMaL",
        label: "Sarah",
        languages: ["en-IN"],
        tts_models: ["eleven_flash_v2_5"],
      },
    ],
  });

  assert.deepEqual(plain(options.languages), [{ code: "en-IN", label: "English (India)" }]);
  assert.deepEqual(plain(options.timezones), ["UTC", "Asia/Kolkata"]);
  assert.equal(options.sttModels[0].id, "deepgram/nova-3");
  assert.equal(options.llmModels[0].id, "bedrock/us.amazon.nova-lite-v1:0");
  assert.equal(options.ttsModels[0].id, "elevenlabs/eleven_flash_v2_5");
  assert.equal(options.voices[0].id, "EXAVITQu4vr4xnSDxMaL");
  assert.deepEqual(plain(options.voices[0].ttsModels), ["elevenlabs/eleven_flash_v2_5"]);
});

test("Indian English stays distinct when filtering speech models and voices", () => {
  const {
    normalizeLanguageCode,
    getSttModelsForLanguage,
    getTtsModelsForLanguage,
    getVoicesForTtsModel,
  } = loadVoicesModule();

  assert.equal(normalizeLanguageCode("en-IN"), "en-IN");
  assert.equal(normalizeLanguageCode("EN-in"), "en-IN");
  assert.equal(normalizeLanguageCode("en-US"), "en");
  assert.equal(normalizeLanguageCode("es"), "es");
  assert.equal(normalizeLanguageCode("fr-CA", [{ code: "fr" }]), "fr");
  assert.ok(getSttModelsForLanguage("en-IN").some((model) => model.id === "sarvam/saaras:v3"));
  assert.ok(getTtsModelsForLanguage("en-IN").some((model) => model.id === "sarvam/bulbul:v3"));
  assert.ok(!getTtsModelsForLanguage("en-IN").some((model) => model.id === "deepgram/aura-2"));
  assert.ok(getVoicesForTtsModel("sarvam/bulbul:v3", "en-IN").length > 0);
});

test("voice tab keeps configured model and voice values visible after refresh", () => {
  const source = readFileSync(join(root, "src/components/agents/tabs/VoiceTab.tsx"), "utf8");

  assert.match(source, /ensureSelectedModelOption/);
  assert.match(source, /ensureSelectedLanguageModelOption/);
  assert.match(source, /ensureSelectedVoiceOption/);
  assert.match(source, /llmModelsWithConfiguredValue/);
  assert.match(source, /voicesWithConfiguredValue/);
  assert.match(source, /Configured \${kind}/);
  assert.match(source, /Configured voice/);
  assert.doesNotMatch(source, /getDefaultVoiceForTtsModel/);
  assert.doesNotMatch(source, /getDefaultSttModelForLanguage/);
  assert.doesNotMatch(source, /getDefaultTtsModelForLanguage/);
});
