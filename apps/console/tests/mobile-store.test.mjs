import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("mobile state hydrates from media queries and releases its resize listener", () => {
  let mediaQuery;
  let subscription;
  let snapshots;
  let notifications = 0;
  const listeners = new Set();
  const media = {
    matches: true,
    addEventListener(event, callback) { assert.equal(event, "change"); listeners.add(callback); },
    removeEventListener(event, callback) { assert.equal(event, "change"); listeners.delete(callback); },
  };
  const cjsModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(
    readFileSync(new URL("../src/hooks/use-mobile.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText, {
    exports: cjsModule.exports,
    window: { matchMedia(query) { mediaQuery = query; return media; } },
    require: () => ({ useSyncExternalStore(subscribe, snapshot, serverSnapshot) {
      subscription = subscribe;
      snapshots = { snapshot, serverSnapshot };
      return snapshot();
    } }),
  });
  assert.equal(cjsModule.exports.useIsMobile(), true);
  assert.equal(mediaQuery, "(max-width: 767px)");
  assert.equal(snapshots.serverSnapshot(), false, "server snapshot must be stable for hydration");
  const unsubscribe = subscription(() => { notifications++; });
  media.matches = false;
  for (const callback of listeners) callback();
  assert.equal(notifications, 1);
  assert.equal(snapshots.snapshot(), false);
  unsubscribe();
  assert.equal(listeners.size, 0);
});
