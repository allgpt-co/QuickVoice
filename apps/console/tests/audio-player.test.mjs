import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/components/calls/AudioPlayer.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const moduleValue = { exports: {} };
vm.runInNewContext(compiled, {
  exports: moduleValue.exports,
  module: moduleValue,
  require: (id) => id.endsWith("/ui/button")
    ? { Button: ({ asChild, children, ...props }) => asChild ? children : React.createElement("button", props, children) }
    : require(id),
});

test("recordings expose accessible seeking, skip, replay, and download controls", () => {
  const html = renderToStaticMarkup(React.createElement(moduleValue.exports.AudioPlayer, { src: "/recording.wav" }));
  for (const label of ["Recording position", "Back 10 seconds", "Play recording", "Forward 10 seconds", "Replay recording"]) {
    assert.ok(html.includes(`aria-label="${label}"`), label);
  }
  assert.match(html, /type="range"/);
  assert.match(html, /href="\/recording.wav"/);

  const empty = renderToStaticMarkup(React.createElement(moduleValue.exports.AudioPlayer, { src: null }));
  assert.match(empty, /No recording available/);
  assert.doesNotMatch(empty, /type="range"|Replay recording/);
});
