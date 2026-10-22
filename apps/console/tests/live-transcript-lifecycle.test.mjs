import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as transcriptTypes from "../src/lib/live-calls/types.ts";

function transcriptHook() {
  const states = [];
  const refs = [];
  const timers = new Map();
  const acknowledgements = [];
  const endedCallIds = new Set();
  const socket = new EventEmitter();
  socket.connected = true;
  const emit = socket.emit.bind(socket);
  socket.emit = (name, payload, acknowledge) => {
    if (name === "live-call:watch") acknowledgements.push(acknowledge);
    else if (name !== "live-call:unwatch") emit(name, payload);
    return true;
  };
  let stateIndex = 0, refIndex = 0, nextTimer = 0, effect, cleanup;
  const context = {
    socket, connectionState: "connected", organizationId: "org_1", endedCallIds,
    markCallEnded: (callId) => endedCallIds.add(callId),
  };
  const cjsModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(
    readFileSync(new URL("../src/hooks/use-live-transcript.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText, {
    exports: cjsModule.exports,
    window: {
      setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
      clearTimeout: (id) => timers.delete(id),
    },
    require: (name) => {
      if (name === "react") return {
        useState: (initial) => {
          const index = stateIndex++;
          if (!(index in states)) states[index] = initial;
          return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
        },
        useRef: (value) => refs[refIndex++] ??= { current: value },
        useMemo: (callback) => callback(),
        useEffect: (callback) => { effect = callback; },
      };
      if (name.endsWith("live-calls/types")) return transcriptTypes;
      if (name.endsWith("live-calls-provider")) return { useLiveCallsSocket: () => context };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const render = () => {
    stateIndex = 0;
    refIndex = 0;
    return cjsModule.exports.useLiveTranscript("call_1");
  };
  const mount = () => { cleanup?.(); render(); cleanup = effect(); };
  mount();
  return { render, mount, socket, timers, acknowledgements, cleanup: () => cleanup?.() };
}

test("missing transcripts stop loading, stay distinct from hangup, and can be retried", () => {
  const hook = transcriptHook();
  hook.acknowledgements[0]({ ok: false, error: { code: "NOT_FOUND", message: "Live call not found" } });
  let view = hook.render();
  assert.equal(view.replayState, "error");
  assert.match(view.error, /Retry/);
  assert.equal(view.isEnded, false);
  assert.equal(hook.timers.size, 0);
  view.retry();
  hook.mount();
  hook.acknowledgements[1]({ ok: true, messages: [], status: "active" });
  view = hook.render();
  assert.equal(view.replayState, "ready");
  assert.equal(view.error, null);
  hook.cleanup();
});

test("hangup wins over delayed replay replies and stops the loading timer", () => {
  const hook = transcriptHook();
  hook.socket.emit("live-call:ended", { organizationId: "org_1", callId: "call_1" });
  hook.acknowledgements[0]({ ok: false, error: { code: "NOT_FOUND", message: "stale error" } });
  const view = hook.render();
  assert.equal(view.isEnded, true);
  assert.equal(view.replayState, "ready");
  assert.equal(view.error, null);
  assert.equal(hook.timers.size, 0);
  hook.acknowledgements[0]({ ok: true, status: "active", messages: [{
    version: 1, type: "transcript.final", eventId: "1-0", organizationId: "org_1",
    callId: "call_1", roomName: "outbound_call_1", messageId: "greeting", speaker: "agent",
    text: "Hello", timestamp: "2026-10-22T12:00:00Z", occurredAt: "2026-10-22T12:00:00Z",
  }] });
  assert.equal(hook.render().messages.length, 1, "A late successful replay still preserves ended-call history");
  assert.equal(hook.render().isEnded, true);
  hook.cleanup();
});

test("an older replay acknowledgement cannot cancel a newer retry timeout", () => {
  const hook = transcriptHook();
  hook.socket.emit("connect");
  hook.acknowledgements[0]({ ok: true, messages: [], status: "active" });
  assert.equal(hook.timers.size, 1);
  [...hook.timers.values()][0]();
  assert.equal(hook.render().replayState, "error");
  hook.cleanup();
  assert.equal(hook.timers.size, 0);
});
