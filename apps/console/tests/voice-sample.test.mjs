import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sample = { audioBase64: Buffer.alloc(48).toString("base64"), contentType: "audio/wav", sampleText: "नमस्ते!" };
const settle = () => new Promise((resolve) => setImmediate(resolve));

function renderPanel(generate = async () => sample) {
  const states = [], effects = [], requests = [], players = [], revoked = [];
  const element = (type, props) => ({ type, props });
  class Audio {
    constructor(src) { this.src = src; this.paused = false; players.push(this); }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() { this.src = ""; }
    load() {}
  }
  const dependencies = {
    react: {
      useRef: (current) => ({ current }), useMemo: (fn) => fn(), useCallback: (fn) => fn,
      useEffect: (fn) => effects.push(fn),
      useState: (value) => [value, (next) => states.push(next)],
    },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "lucide-react": {},
    "@/src/components/ui/badge": { Badge: "badge" },
    "@/src/components/ui/button": { Button: "button" },
    "@/src/lib/api/resources/agents": { agentsApi: { createVoiceSample: (...args) => { requests.push(args); return generate(...args); } } },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../src/components/agents/VoiceProfilePanel.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: cjsModule, exports: cjsModule.exports, Audio, AbortController, atob, Blob, Error,
    URL: { createObjectURL: () => `blob:${players.length}`, revokeObjectURL: (url) => revoked.push(url) },
    require: (name) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  const tree = cjsModule.exports.VoiceProfilePanel({
    agentId: "agent", language: "hi", languageLabel: "Hindi", ttsModel: "elevenlabs/eleven_flash_v2_5",
    ttsModelLabel: "ElevenLabs Flash v2.5", sampleText: sample.sampleText, canPreview: true,
    voice: { id: "UgBBYS2sOqTuMpoF3BR0", name: "Mark", locale: "en", languages: ["en", "hi"] },
  });
  function findButton(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "button") return node;
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = findButton(child);
      if (found) return found;
    }
  }
  const button = findButton(tree);
  assert.ok(button);
  const cleanups = effects.map((fn) => fn());
  return { click: button.props.onClick, cleanup: () => cleanups.forEach((fn) => fn?.()), states, requests, players, revoked };
}

test("voice preview sends current model, voice and selected language, not the voice's default locale", async () => {
  const panel = renderPanel();
  panel.click();
  await settle();
  assert.equal(panel.requests[0][0], "agent");
  assert.deepEqual(JSON.parse(JSON.stringify(panel.requests[0][1])), {
    language: "hi", ttsModel: "elevenlabs/eleven_flash_v2_5", voiceId: "UgBBYS2sOqTuMpoF3BR0",
  });
  assert.equal(panel.players.length, 1);
  assert.ok(panel.states.includes("playing"));
  panel.click();
  assert.equal(panel.players[0].paused, true);
  assert.equal(panel.requests[0][2].aborted, true);
  assert.equal(panel.revoked.length, 1);
  panel.click();
  await settle();
  assert.equal(panel.requests.length, 1, "replay uses the already generated sample");
  panel.cleanup();
  assert.equal(panel.players[1].paused, true);
});

test("leaving or changing selections cancels generation and ignores late audio", async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const panel = renderPanel(() => pending);
  panel.click();
  panel.cleanup();
  assert.equal(panel.requests[0][2].aborted, true);
  const stateCount = panel.states.length;
  resolve(sample);
  await settle();
  assert.equal(panel.players.length, 0);
  assert.equal(panel.states.length, stateCount, "no state update after unmount");
});

test("provider failure is displayed and the same control allows retry", async () => {
  let fail = true;
  const panel = renderPanel(async () => { if (fail) throw new Error("Provider not configured"); return sample; });
  panel.click();
  await settle();
  assert.ok(panel.states.includes("Provider not configured"));
  fail = false;
  panel.click();
  await settle();
  assert.equal(panel.players.length, 1);
  panel.cleanup();
});
