import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCTOR = path.join(ROOT, "scripts/dev-doctor.sh");

async function withBin(stubs, callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quickvoice-doctor-bin-"));
  try {
    for (const [name, body] of Object.entries(stubs)) {
      const file = path.join(dir, name);
      await writeFile(file, `#!/bin/sh\n${body}\n`);
      await chmod(file, 0o755);
    }
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function healthyStubs(overrides = {}) {
  return {
    dirname: 'case "$1" in */*) printf "%s\\n" "${1%/*}" ;; *) printf ".\\n" ;; esac',
    head: 'IFS= read -r line; printf "%s\\n" "$line"',
    cat: 'while IFS= read -r line; do printf "%s\\n" "$line"; done',
    task: 'echo "Task version: v3.45.4"',
    go: 'echo "go version go1.24.0 linux/amd64"',
    node: 'if [ "$1" = "-v" ]; then echo "v24.0.0"; exit 0; fi; exit 0',
    corepack: 'echo "Corepack 0.34.0"',
    python3: 'echo "Python 3.12.0"',
    docker: 'echo "Docker version 28.0.0"',
    ...overrides,
  };
}

function runDoctor(binDir) {
  return new Promise((resolve) => {
    const child = spawn("/bin/bash", [DOCTOR], {
      cwd: ROOT,
      env: {
        PATH: binDir,
        QUICKVOICE_DOCTOR_SKIP_RUNTIME: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
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

test("dev doctor reports unsupported Node with the required version", async () => {
  await withBin(
    healthyStubs({
      node: 'if [ "$1" = "-v" ]; then echo "v18.19.0"; exit 0; fi; exit 1',
    }),
    async (binDir) => {
      const result = await runDoctor(binDir);

      assert.equal(result.code, 1);
      assert.match(result.stderr, /Node\.js \^20\.19, \^22\.13, or >=24 is required\. Found: v18\.19\.0/);
    },
  );
});

test("dev doctor reports missing Corepack by exact prerequisite name", async () => {
  const stubs = healthyStubs();
  delete stubs.corepack;
  await withBin(stubs, async (binDir) => {
    const result = await runDoctor(binDir);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /corepack is required to activate pnpm@9\.0\.0/);
  });
});

test("dev doctor reports missing Go Task by exact prerequisite name", async () => {
  const stubs = healthyStubs();
  delete stubs.task;
  await withBin(stubs, async (binDir) => {
    const result = await runDoctor(binDir);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /go-task is not installed/);
  });
});
