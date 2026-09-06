import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const auditScript = "scripts/audit-public-claims.mjs";

function runAudit(args) {
  return spawnSync(process.execPath, [auditScript, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

test("open-source launch surface passes the public claims gate", () => {
  const result = runAudit([
    "--json",
    "--target",
    "apps/web/src/app/open-source",
    "--target",
    "apps/web/src/components/open-source",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.findingCount, 0);
  assert.ok(report.scannedFiles >= 3);
});

test("public claims audit rejects targets outside the repository", () => {
  const result = runAudit(["--target", "../outside"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Target must stay inside the repository/);
});

test("an unregistered suppression marker cannot hide an unsupported claim", () => {
  const directory = mkdtempSync(join(repositoryRoot, ".claims-audit-test-"));
  try {
    const file = join(directory, "claim.md");
    writeFileSync(
      file,
      "<!-- claims-audit: allow MADE-UP -->\nQuickVoice: no setup, guaranteed results.\n",
    );
    const result = runAudit([
      "--json",
      "--target",
      relative(repositoryRoot, file),
    ]);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.ok(
      report.findings.some(
        (finding) => finding.rule === "UNSUPPORTED_EXCEPTION",
      ),
    );
    assert.ok(
      report.findings.some((finding) => finding.rule === "ABSOLUTE_OUTCOME"),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
