import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SCRIPT = fileURLToPath(new URL("../scripts/check-markdown-links.mjs", import.meta.url));

async function fixture() {
  return mkdtemp(path.join(os.tmpdir(), "quickvoice-md-links-"));
}

function runChecker(root, files = []) {
  return new Promise((resolve) => {
    const args = [SCRIPT, "--root", root, ...files.flatMap((file) => ["--file", file])];
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
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

test("Markdown link checker accepts valid relative links and decoded heading fragments", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "docs"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "# Home\n\nSee [API](docs/api.md#api%20reference).\n");
  await writeFile(path.join(root, "docs/api.md"), "# API Reference\n\nBack to [home](../README.md#home).\n");

  const result = await runChecker(root);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /checked 2 Markdown files/);
});

test("Markdown link checker reports missing files with source path and line", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "README.md"), "# Home\n\nSee [missing](docs/missing.md).\n");

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /README\.md:3 missing target docs\/missing\.md/);
});

test("Markdown link checker reports missing same-file headings", async () => {
  const root = await fixture();
  await writeFile(path.join(root, "README.md"), "# Home\n\nSee [missing](#missing%20heading).\n");

  const result = await runChecker(root);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /README\.md:3 missing heading #missing heading/);
});

test("Markdown link checker explicitly excludes generated and vendor directories", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "node_modules/pkg"), { recursive: true });
  await mkdir(path.join(root, "apps/server/prisma/generated/prisma"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "# Home\n");
  await writeFile(path.join(root, "node_modules/pkg/README.md"), "[bad](missing.md)\n");
  await writeFile(path.join(root, "apps/server/prisma/generated/prisma/README.md"), "[bad](missing.md)\n");

  const result = await runChecker(root);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /checked 1 Markdown files/);
});
