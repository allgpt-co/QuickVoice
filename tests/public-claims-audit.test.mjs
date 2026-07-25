import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
