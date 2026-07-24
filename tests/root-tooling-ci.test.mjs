import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("required CI workflow gates pull requests with parallel quality shards", async () => {
  const ci = await text(".github/workflows/ci.yml");

  assert.match(ci, /^name: CI/m);
  assert.match(ci, /pull_request:/);
  assert.match(ci, /workflow_call:/);
  assert.match(ci, /pnpm install --frozen-lockfile/);
  assert.doesNotMatch(ci, /runs-on: self-hosted/);
  assert.match(ci, /runs-on: ubuntu-latest/);
  assert.match(ci, /workspace-config:/);
  assert.match(ci, /root-tests:/);
  assert.match(ci, /console:/);
  assert.match(ci, /web:/);
  assert.match(ci, /server:/);
  assert.match(ci, /ai-python:/);
  assert.match(ci, /docker-server:/);
  assert.match(ci, /docker-ai:/);
  assert.match(ci, /quality-summary:/);
  assert.match(ci, /pnpm check:tasks/);
  assert.match(ci, /pnpm check:configs/);
  assert.match(ci, /pnpm --filter console lint/);
  assert.match(ci, /pnpm --filter web build/);
  assert.match(ci, /pnpm --filter server test/);
  assert.match(ci, /node --test tests\/\*\.test\.mjs/);
  assert.match(ci, /node --test apps\/console\/tests\/\*\.test\.mjs/);
  assert.match(ci, /python -m pip install -r requirements\.txt/);
  assert.match(ci, /python -m pip install pytest/);
  assert.match(ci, /python -m pytest tests/);
  assert.match(ci, /node-version: "24"/);
  assert.match(ci, /docker build \\/);
  assert.match(ci, /for attempt in 1 2 3/);
  assert.match(ci, /retrying after transient registry\/network failure/);
  assert.match(ci, /PREINSTALL_CPU_TORCH=true/);
  assert.match(ci, /SKIP_MODEL_DOWNLOAD=true/);
  assert.match(ci, /Write quality gate summary/);
  assert.match(ci, /## Quality gate/);
  assert.match(ci, /GITHUB_STEP_SUMMARY/);
});

test("security audit fails on high advisories and uses explicit suppressions", async () => {
  const workflow = await text(".github/workflows/security-audit.yml");
  const suppressions = JSON.parse(
    await text("security/audit-suppressions.json"),
  );

  assert.match(workflow, /pnpm audit:deps/);
  assert.match(workflow, /--audit-level high/);
  assert.doesNotMatch(workflow, /runs-on: self-hosted/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.ok(Array.isArray(suppressions.suppressions));
  assert.ok(suppressions.suppressions.length > 0);

  const keys = new Set();
  for (const suppression of suppressions.suppressions) {
    assert.match(suppression.id, /^GHSA-|^CVE-|^\d+$/);
    assert.ok(suppression.module);
    assert.ok(suppression.reason.includes("Temporary baseline suppression"));
    assert.equal(suppression.expires, "2026-08-20");
    assert.ok(Array.isArray(suppression.contexts));
    assert.ok(suppression.contexts.length > 0);
    for (const context of suppression.contexts) {
      assert.ok(
        ["production dependencies", "all dependencies"].includes(context),
      );
    }
    const key = `${suppression.module}:${suppression.id}`;
    assert.equal(keys.has(key), false, `duplicate suppression ${key}`);
    keys.add(key);
  }
});

test("deploy workflows are gated, immutable, scanned, signed, and environment protected", async () => {
  const workflow = await text(".github/workflows/backend-build.yml");

  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /runs-on: self-hosted/);
  assert.match(workflow, /build-server:/);
  assert.match(workflow, /build-ai:/);
  assert.match(workflow, /deploy:/);
  assert.match(
    workflow,
    /needs: \[changes, validate-config, build-server, build-ai\]/,
  );
  assert.match(workflow, /environment:/);
  assert.match(workflow, /Validate deployment configuration/);
  assert.match(workflow, /REQUIRED_AWS_ROLE_ARN/);
  assert.match(workflow, /REQUIRED_AWS_REGION/);
  assert.match(workflow, /REQUIRED_SERVER_ECR_REPOSITORY/);
  assert.match(workflow, /REQUIRED_AI_ECR_REPOSITORY/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /GitHub repository variables/);
  assert.match(workflow, /github\.sha/);
  assert.doesNotMatch(workflow, /:latest/);
  assert.match(workflow, /docker build \\/);
  assert.match(workflow, /docker push/);
  assert.match(workflow, /aws ecr describe-images/);
  assert.match(workflow, /for attempt in 1 2 3/);
  assert.match(workflow, /retrying after transient registry\/network failure/);
  assert.match(workflow, /Smoke test pushed server image manifest/);
  assert.match(workflow, /Smoke test pushed AI image manifest/);
  assert.match(workflow, /aquasecurity\/trivy-action@/);
  assert.match(workflow, /sigstore\/cosign-installer@/);
  assert.match(workflow, /cosign sign/);
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /Rollback metadata/);
});

test("GitHub templates surface contributor workflow expectations", async () => {
  const pr = await text(".github/pull_request_template.md");
  const config = await text(".github/ISSUE_TEMPLATE/config.yml");
  const bug = await text(".github/ISSUE_TEMPLATE/bug.yml");
  const setup = await text(".github/ISSUE_TEMPLATE/setup.yml");
  const docs = await text(".github/ISSUE_TEMPLATE/docs.yml");
  const feature = await text(".github/ISSUE_TEMPLATE/feature.yml");

  assert.match(pr, /task doctor/);
  assert.match(pr, /pnpm ci:local/);
  assert.match(pr, /Dependency changes/);
  assert.match(pr, /UI screenshots/);
  assert.match(pr, /Environment changes/);
  assert.match(config, /blank_issues_enabled: false/);
  assert.match(config, /security\/policy/);
  assert.match(bug, /Minimal reproduction/);
  assert.match(bug, /unpatched security vulnerability/);
  assert.match(setup, /task up:dev/);
  assert.match(setup, /Native Windows PowerShell/);
  assert.match(docs, /Repository evidence/);
  assert.match(feature, /wait for scope agreement and assignment/);
});

test("server runtime image installs only production server dependencies", async () => {
  const dockerfile = await text("apps/server/Dockerfile");

  assert.match(
    dockerfile,
    /pnpm install --frozen-lockfile --prod --filter server\.\.\./,
  );
  assert.doesNotMatch(dockerfile, /pnpm .*deploy/);
  assert.match(dockerfile, /apt-get upgrade -y/);
  assert.match(
    dockerfile,
    /COPY packages\/typescript-config packages\/typescript-config/,
  );
  assert.match(dockerfile, /rm -rf[\s\S]*\/root\/\.cache\/node/);
  assert.match(dockerfile, /rm -rf[\s\S]*\/usr\/local\/lib\/node_modules\/npm/);
  assert.match(
    dockerfile,
    /rm -rf[\s\S]*\/usr\/local\/lib\/node_modules\/corepack/,
  );
  assert.doesNotMatch(
    dockerfile,
    /COPY packages\/typescript-config\/package\.json/,
  );
  assert.doesNotMatch(
    dockerfile,
    /COPY --from=build .*\/app\/node_modules \/app\/node_modules/,
  );
});

test("server runtime image lets the non-root user run Prisma migrations", async () => {
  const dockerfile = await text("apps/server/Dockerfile");

  assert.match(dockerfile, /chown -R server:nodejs \/app\/node_modules/);
  assert.match(dockerfile, /USER server/);
  assert.match(dockerfile, /prisma migrate deploy/);
});

test("Dependabot covers npm, GitHub Actions, Dockerfiles, and AI Python requirements", async () => {
  const dependabot = await text(".github/dependabot.yml");

  for (const ecosystem of ["npm", "github-actions", "docker", "pip"]) {
    assert.match(dependabot, new RegExp(`package-ecosystem: "${ecosystem}"`));
  }

  assert.match(dependabot, /directory: "\/apps\/server"/);
  assert.match(dependabot, /directory: "\/apps\/ai"/);
});
