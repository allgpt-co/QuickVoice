import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SCRIPT = fileURLToPath(new URL("../scripts/check-env-templates.mjs", import.meta.url));

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "quickvoice-env-check-"));
  await mkdir(path.join(root, "apps/server"), { recursive: true });
  await mkdir(path.join(root, "apps/console"), { recursive: true });
  return root;
}

function runChecker(root) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, "--root", root], { stdio: ["ignore", "pipe", "pipe"] });
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

test("env template checker inventories keys and paths without values", async () => {
  const root = await fixture();
  await writeFile(path.join(root, ".env.dev.example"), "# comment\nSERVER_URL=http://localhost:5000\nINTERNAL_API_KEY=dev-shared-key\n\n");
  await writeFile(path.join(root, "apps/server/.env.dev.example"), "INTERNAL_API_KEY=dev-shared-key\nSERVER_API_URL=http://localhost:5000/api/v1\n");
  await writeFile(path.join(root, "apps/console/.env.dev.example"), "NEXT_PUBLIC_SERVER_URL=http://localhost:5000\n");

  const result = await runChecker(root);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /INTERNAL_API_KEY\t\.env\.dev\.example\tplaceholder=yes/);
  assert.match(result.stdout, /SERVER_API_URL\tapps\/server\/\.env\.dev\.example/);
  assert.doesNotMatch(result.stdout, /dev-shared-key|http:\/\/localhost:5000/);
});

test("env template checker fails explicit duplicate placeholder drift without printing values", async () => {
  const root = await fixture();
  await writeFile(path.join(root, ".env.dev.example"), "SERVER_URL=http://localhost:5000\nINTERNAL_API_KEY=dev-shared-key\n");
  await writeFile(path.join(root, "apps/server/.env.dev.example"), "INTERNAL_API_KEY=dev-other-key\nSERVER_API_URL=http://localhost:5000/api/v1\n");
  await writeFile(path.join(root, "apps/console/.env.dev.example"), "NEXT_PUBLIC_SERVER_URL=http://localhost:5000\n");

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /INTERNAL_API_KEY mismatch/);
  assert.doesNotMatch(result.stderr, /dev-shared-key|dev-other-key/);
});

test("env template checker fails documented local URL drift", async () => {
  const root = await fixture();
  await writeFile(path.join(root, ".env.dev.example"), "SERVER_URL=http://localhost:5000\n");
  await writeFile(path.join(root, "apps/console/.env.dev.example"), "NEXT_PUBLIC_SERVER_URL=http://localhost:5999\n");

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /NEXT_PUBLIC_SERVER_URL must match SERVER_URL/);
  assert.doesNotMatch(result.stderr, /5999|5000/);
});
