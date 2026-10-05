import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parse } from "yaml";

const workflow = (name) => parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"));
const hotfix = workflow("quickvoice-ai-hotfix-deploy");
const job = hotfix.jobs["deploy-ai"];
const script = job.steps.find((step) => step.id === "deploy").run;

test("hotfix requires an explicit image and uses the protected self-hosted deploy runner", () => {
  assert.equal(hotfix.on.workflow_dispatch.inputs.ai_image.required, true);
  assert.equal(hotfix.on.workflow_dispatch.inputs.ai_image.default, undefined);
  assert.equal(job["runs-on"], "self-hosted");
  assert.equal(job.environment.name, "production-backend");
  assert.equal(job.env.AI_IMAGE, "${{ inputs.ai_image }}");
  assert.doesNotMatch(script, /\$\{\{\s*inputs\./);
});

function runHotfix(t, image, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "qv-hotfix-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, "requests");
  writeFileSync(log, "");
  writeFileSync(join(dir, "curl"), `#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync(process.env.REQUEST_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.FAIL_PATCH === 'true' && process.argv.includes('PATCH')) process.exit(22);
`, { mode: 0o700 });
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8", timeout: 5000,
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, AI_IMAGE: image,
      COOLIFY_API_URL: "https://coolify.invalid/api/v1", COOLIFY_QUICKVOICE_AI_RESOURCE_UUID: "ai-resource",
      COOLIFY_API_TOKEN: "fake-token", GITHUB_STEP_SUMMARY: join(dir, "summary"), REQUEST_LOG: log, ...extra },
  });
  const requests = readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  return { ...result, requests };
}

test("valid tagged images PATCH configuration before triggering deploy", (t) => {
  for (const suffix of ["", `@sha256:${"a".repeat(64)}`]) {
    const result = runHotfix(t, `registry.example:5000/team/ai:sha-abc123${suffix}`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.requests.length, 2);
    assert.ok(result.requests[0].includes("PATCH"));
    assert.deepEqual(JSON.parse(result.requests[0][result.requests[0].indexOf("--data") + 1]), {
      docker_registry_image_name: "registry.example:5000/team/ai",
      docker_registry_image_tag: "sha-abc123",
    });
    assert.ok(result.requests[1].includes("POST"));
  }
});

test("malformed or injection-bearing image inputs make no HTTP requests", (t) => {
  for (const input of ["", "registry.example/team/ai", "registry.example:5000/team/ai", 'registry.example/ai:tag","other":"injected',
    "registry.example/ai:tag\nother", "registry.example/ai:$(touch SHOULD_NOT_RUN)", "registry.example/ai:tag@sha256:bad"]) {
    const result = runHotfix(t, input);
    assert.notEqual(result.status, 0, input);
    assert.deepEqual(result.requests, []);
  }
});

test("configuration and PATCH failures cannot trigger a deploy", (t) => {
  const missing = runHotfix(t, "registry.example/ai:tag", { COOLIFY_API_TOKEN: "" });
  assert.notEqual(missing.status, 0);
  assert.equal(missing.requests.length, 0);
  const failedPatch = runHotfix(t, "registry.example/ai:tag", { FAIL_PATCH: "true" });
  assert.equal(failedPatch.status, 22);
  assert.equal(failedPatch.requests.length, 1);
});

test("hotfix image payload builder escapes quotes, backslashes, and newlines", () => {
  for (const name of ["quickvoice-ai-hotfix-deploy"]) {
    const steps = Object.values(workflow(name).jobs).flatMap((entry) => entry.steps ?? []);
    const deploy = steps.find((step) => step.run?.includes("docker_registry_image_name"));
    const assignment = deploy.run.match(/payload="\$\(jq[\s\S]*?\)"/)?.[0];
    assert.ok(assignment, name);
    const value = 'quote" backslash\\ newline\n';
    const result = spawnSync("bash", ["-c", `${assignment}\nprintf '%s' "$payload"`], {
      encoding: "utf8", env: { ...process.env, image_name: value, tag: value },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { docker_registry_image_name: value, docker_registry_image_tag: value });
    assert.match(deploy.run, /--data "\$payload"/);
  }
});

test("backend and MCP use the tested image deployment helper", () => {
  for (const name of ["backend-build", "deploy-mcp-server"]) {
    const steps = Object.values(workflow(name).jobs).flatMap((entry) => entry.steps ?? []);
    assert.ok(steps.some((step) => step.run?.includes("node .github/scripts/deploy-image.mjs")), name);
    assert.ok(!steps.some((step) => step.run?.includes("docker_registry_image_name")), name);
  }
});
