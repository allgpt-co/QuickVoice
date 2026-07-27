import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

async function writeFakePnpm(dir) {
  const fakePnpm = join(dir, "pnpm");
  await writeFile(fakePnpm, "#!/usr/bin/env bash\nprintf '{}\\n'\n");
  await chmod(fakePnpm, 0o755);
  return fakePnpm;
}

async function writeSuppressions(dir, suppressions) {
  const file = join(dir, "audit-suppressions.json");
  await writeFile(
    file,
    JSON.stringify({ suppressions }, null, 2),
    "utf8"
  );
  return file;
}

function runSecurityAudit(args, env, fakeBin) {
  return spawnSync(process.execPath, ["scripts/security-audit.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
    },
  });
}

test("security audit rejects expired suppressions before running pnpm audit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "quickvoice-audit-"));
  await writeFakePnpm(dir);
  const suppressionsFile = await writeSuppressions(dir, [
    {
      id: "GHSA-expired",
      module: "example-package",
      contexts: ["production dependencies"],
      reason: "Temporary baseline suppression used by the expiry test.",
      expires: "2026-06-19",
    },
  ]);

  const result = runSecurityAudit(
    ["--check-suppressions-only", "--suppressions-file", suppressionsFile],
    { SECURITY_AUDIT_TODAY: "2026-06-20" },
    dir
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expired dependency audit suppressions/i);
  assert.match(result.stderr, /example-package GHSA-expired expired on 2026-06-19/);
});

test("security audit writes suppression counts and expiring-soon warnings to the CI summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "quickvoice-audit-"));
  await writeFakePnpm(dir);
  const summaryFile = join(dir, "summary.md");
  const suppressionsFile = await writeSuppressions(dir, [
    {
      id: "GHSA-soon",
      module: "example-package",
      contexts: ["all dependencies"],
      reason: "Temporary baseline suppression used by the expiry test.",
      expires: "2026-07-01",
    },
  ]);

  const result = runSecurityAudit(
    ["--check-suppressions-only", "--suppressions-file", suppressionsFile],
    {
      GITHUB_STEP_SUMMARY: summaryFile,
      SECURITY_AUDIT_TODAY: "2026-06-20",
    },
    dir
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /expiring within 30 days/i);

  const summary = await readFile(summaryFile, "utf8");
  assert.match(summary, /## Dependency audit suppressions/);
  assert.match(summary, /Active suppressions: 1/);
  assert.match(summary, /Expiring within 30 days: 1/);
  assert.match(summary, /example-package GHSA-soon expires on 2026-07-01/);
});

test("security audit rejects unknown severity levels instead of silently using high", async () => {
  const dir = await mkdtemp(join(tmpdir(), "quickvoice-audit-"));
  await writeFakePnpm(dir);

  const result = runSecurityAudit(
    ["--audit-level", "severe", "--check-suppressions-only"],
    {},
    dir
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid --audit-level "severe"/);
});
