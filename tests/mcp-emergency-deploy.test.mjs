import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parse } from "yaml";

const workflow = (name) => parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"));
const emergency = workflow("mcp-emergency-deploy");
const deploy = workflow("deploy-mcp-server");
const validation = emergency.jobs["validate-request"];
const script = validation.steps.find((step) => step.id === "validate").run;

test("emergency path preserves exact-source MCP validation, audit and production gates", () => {
  const ci = workflow("ci");
  assert.ok(ci.jobs["quality-summary"].needs.includes("mcp-server"));
  assert.equal(emergency.on.workflow_dispatch.inputs.bypass_quality_summary.default, false);
  assert.match(validation.if, /github.ref == 'refs\/heads\/main'/);
  assert.match(validation.if, /PRODUCTION_ENVIRONMENTS_PROTECTED == 'true'/);
  assert.equal(emergency.jobs.deploy.needs, "validate-request");
  assert.equal(emergency.jobs.deploy.uses, "./.github/workflows/deploy-mcp-server.yml");
  assert.equal(emergency.jobs.deploy.with.source_sha, "${{ needs.validate-request.outputs.source_sha }}");
  assert.equal(deploy.concurrency["cancel-in-progress"], false);
  const checks = deploy.jobs["security-audit"];
  assert.equal(checks["runs-on"], "ubuntu-latest");
  assert.equal(checks["continue-on-error"], undefined);
  assert.equal(checks.if, "github.ref == 'refs/heads/main'");
  assert.equal(checks.steps.find((step) => step.uses?.startsWith("actions/checkout@")).with.ref, "${{ inputs.source_sha }}");
  for (const command of ["pnpm install --frozen-lockfile", "pnpm --filter quickvoice-mcp-server lint", "pnpm --filter quickvoice-mcp-server build", "pnpm --filter quickvoice-mcp-server test:transport", "pnpm audit:deps --audit-level low"]) {
    const step = checks.steps.find((step) => step.run === command);
    assert.ok(step, command);
    assert.equal(step["continue-on-error"], undefined);
    assert.equal(step.if, undefined);
  }
  assert.ok(deploy.jobs["build-and-push"].needs.includes("security-audit"));
  for (const job of ["build-and-push", "trigger-coolify"]) {
    assert.equal(deploy.jobs[job].environment.name, "production-mcp-server");
  }
  assert.equal(deploy.jobs["trigger-coolify"].needs, "build-and-push");
  assert.doesNotMatch(script, /\$\{\{\s*inputs\./);
  for (const step of validation.steps.filter((step) => step.uses)) {
    assert.match(step.uses, /@[a-f0-9]{40}$/);
  }
});

test("emergency validator accepts only confirmed merged commits and records the incident", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "qv-mcp-emergency-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-b", "main");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "main");
  const merged = git("rev-parse", "HEAD");
  git("checkout", "-b", "unmerged");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "unmerged");
  const unmerged = git("rev-parse", "HEAD");
  git("checkout", "main");
  const output = join(dir, "output");
  const summary = join(dir, "summary");
  const run = (extra = {}) => {
    writeFileSync(output, "");
    writeFileSync(summary, "");
    return spawnSync("bash", ["-c", script], { cwd: dir, encoding: "utf8", timeout: 5000,
      env: { ...process.env, SOURCE_SHA: merged, CONFIRMED: "true", REASON: 'Incident #42: unrelated docs failure $(touch injected)',
        REQUESTED_BY: "reviewer", GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, ...extra },
    });
  };
  assert.equal(run().status, 0);
  assert.equal(readFileSync(output, "utf8"), `source_sha=${merged}\n`);
  assert.match(readFileSync(summary, "utf8"), /Incident #42/);
  assert.throws(() => readFileSync(join(dir, "injected")), /ENOENT/);
  for (const extra of [{ CONFIRMED: "false" }, { REASON: " \n " }, { SOURCE_SHA: "main" }, { SOURCE_SHA: "a".repeat(40) }, { SOURCE_SHA: unmerged }, { SOURCE_SHA: '$(touch injected)' }]) {
    assert.notEqual(run(extra).status, 0, JSON.stringify(extra));
    assert.equal(readFileSync(output, "utf8"), "");
  }
});
