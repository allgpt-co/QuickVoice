import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("README links the tested macOS setup guide", async () => {
  const readme = await text("README.md");

  assert.match(readme, /\[macOS setup guide\]\(\.\/docs\/setup\/macos\.md\)/i);
});

test("macOS setup guide explains prerequisite checks without protected system changes", async () => {
  const guide = await text("docs/setup/macos.md");

  for (const required of [
    "command -v bash",
    "bash --version",
    "type -a bash",
    "docker compose version",
    "node --version",
    "corepack --version",
    "python3 --version",
    "task --version",
    "task doctor",
    "#!/usr/bin/env bash",
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ]) {
    assert.match(
      guide,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }

  assert.doesNotMatch(guide, /replace\s+\/bin\/bash/i);
  assert.doesNotMatch(
    guide,
    /sudo\s+(?:nano|vim|vi|edit|mv|rm|cp).*\/bin\/bash/i,
  );
  assert.doesNotMatch(guide, /production\s+credential/i);
  assert.doesNotMatch(guide, /paid\s+provider/i);
});
