import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCTOR = path.join(ROOT, "scripts/dev-doctor.sh");
const BASH = findBash();

function findBash() {
  const candidates = process.platform === "win32" ? ["bash.exe", "bash"] : ["/bin/bash", "bash"];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (result.error) continue;
    if (path.isAbsolute(candidate)) return candidate;
    return resolveCommand(candidate) ?? candidate;
  }
  return null;
}

function resolveCommand(command) {
  if (process.platform === "win32") {
    const result = spawnSync("where.exe", [command], { encoding: "utf8" });
    return result.stdout?.split(/\r?\n/).find(Boolean)?.trim() ?? null;
  }

  return null;
}

function toBashPath(nativePath) {
  if (process.platform !== "win32") return nativePath;

  const result = spawnSync(
    BASH,
    [
      "-lc",
      'if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; elif command -v wslpath >/dev/null 2>&1; then wslpath -u "$1"; else printf "%s\n" "$1"; fi',
      "quickvoice-path",
      nativePath,
    ],
    { encoding: "utf8" },
  );
  if (!result.error && result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }

  return nativePath.replace(/\\/g, "/").replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
}

function bashSupportPaths() {
  if (process.platform !== "win32" || !BASH) return [];

  const bashDir = path.dirname(BASH);
  const gitRoot = path.basename(bashDir).toLowerCase() === "bin" ? path.dirname(bashDir) : path.dirname(path.dirname(bashDir));
  return [bashDir, path.join(gitRoot, "usr", "bin"), path.join(gitRoot, "bin")]
    .map(toBashPath)
    .filter((entry, index, entries) => entry && entries.indexOf(entry) === index);
}

function doctorPath(binDir) {
  return [toBashPath(binDir), ...bashSupportPaths(), "/usr/bin", "/bin"].join(":");
}

function formatDoctorResult(result) {
  return [
    `exit code: ${result.code}`,
    result.stdout && `stdout:\n${result.stdout}`,
    result.stderr && `stderr:\n${result.stderr}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const bashOnly = BASH ? {} : { skip: "dev-doctor prerequisite checks require Bash" };

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
    const child = spawn(BASH, [toBashPath(DOCTOR)], {
      cwd: ROOT,
      env: {
        ...process.env,
        PATH: doctorPath(binDir),
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

test("dev doctor reports unsupported Node with the required version", bashOnly, async () => {
  await withBin(
    healthyStubs({
      node: 'if [ "$1" = "-v" ]; then echo "v18.19.0"; exit 0; fi; exit 1',
    }),
    async (binDir) => {
      const result = await runDoctor(binDir);

      assert.equal(result.code, 1, formatDoctorResult(result));
      assert.match(result.stderr, /Node\.js \^20\.19, \^22\.13, or >=24 is required\. Found: v18\.19\.0/);
    },
  );
});

test("dev doctor reports missing Corepack by exact prerequisite name", bashOnly, async () => {
  const stubs = healthyStubs();
  delete stubs.corepack;
  await withBin(stubs, async (binDir) => {
    const result = await runDoctor(binDir);

    assert.equal(result.code, 1, formatDoctorResult(result));
    assert.match(result.stderr, /corepack is required to activate pnpm@9\.0\.0/);
  });
});

test("dev doctor reports missing Go Task by exact prerequisite name", bashOnly, async () => {
  const stubs = healthyStubs();
  delete stubs.task;
  await withBin(stubs, async (binDir) => {
    const result = await runDoctor(binDir);

    assert.equal(result.code, 1, formatDoctorResult(result));
    assert.match(result.stderr, /go-task is not installed/);
  });
});
