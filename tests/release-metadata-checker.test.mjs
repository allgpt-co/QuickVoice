import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SCRIPT = fileURLToPath(new URL("../scripts/check-release-metadata.mjs", import.meta.url));

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "quickvoice-release-check-"));
  await mkdir(path.join(root, "docs/releases"), { recursive: true });
  return root;
}

function runChecker(root, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, "--root", root, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const releaseBody = `# QuickVoice v0.1.0

> Status: released.

## Install Requirements

Node.js >=20.9.

## Known Limitations

Provider-backed features need credentials.

## Verification

Release checks passed.
`;

const draftBody = releaseBody.replace("Status: released.", "Status: draft — not released.");

test("release metadata checker accepts an explicit draft without requiring a changelog release", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n");
  await writeFile(path.join(root, "docs/releases/v0.1.0-draft.md"), draftBody);

  const result = await runChecker(root, ["v0.1.0", "--draft"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /draft release metadata is internally consistent/);
});

test("release metadata checker fails publish mode when changelog heading is missing", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n");
  await writeFile(path.join(root, "docs/releases/v0.1.0.md"), releaseBody);

  const result = await runChecker(root, ["v0.1.0", "--publish"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /CHANGELOG\.md must contain a release heading for v0\.1\.0/);
});

test("release metadata checker fails publish mode when filename and title disagree", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "CHANGELOG.md"), "# Changelog\n\n## v0.1.0 - 2026-07-26\n");
  await writeFile(path.join(root, "docs/releases/v0.1.0.md"), releaseBody.replace("v0.1.0", "v0.2.0"));

  const result = await runChecker(root, ["v0.1.0"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /title must match v0\.1\.0/);
});
