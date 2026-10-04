import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function workflow(path) {
  return readFile(
    new URL(`../.github/workflows/${path}`, import.meta.url),
    "utf8",
  );
}

function assertCoolifyDeploys(workflowBody) {
  assert.match(workflowBody, /group: quickvoice-backend-deploy-production/);
  assert.match(
    workflowBody,
    /COOLIFY_API_URL: \$\{\{ vars\.COOLIFY_API_URL \}\}/,
  );
  assert.match(
    workflowBody,
    /COOLIFY_QUICKVOICE_SERVER_RESOURCE_UUID: \$\{\{ vars\.COOLIFY_QUICKVOICE_SERVER_RESOURCE_UUID \}\}/,
  );
  assert.match(
    workflowBody,
    /COOLIFY_QUICKVOICE_AI_RESOURCE_UUID: \$\{\{ vars\.COOLIFY_QUICKVOICE_AI_RESOURCE_UUID \}\}/,
  );

  assert.match(
    workflowBody,
    /REQUIRED_COOLIFY_API_URL: \$\{\{ env\.COOLIFY_API_URL \}\}/,
  );
  assert.match(
    workflowBody,
    /REQUIRED_COOLIFY_QUICKVOICE_SERVER_RESOURCE_UUID: \$\{\{ env\.COOLIFY_QUICKVOICE_SERVER_RESOURCE_UUID \}\}/,
  );
  assert.match(
    workflowBody,
    /REQUIRED_COOLIFY_QUICKVOICE_AI_RESOURCE_UUID: \$\{\{ env\.COOLIFY_QUICKVOICE_AI_RESOURCE_UUID \}\}/,
  );
  assert.doesNotMatch(workflowBody, /REQUIRED_COOLIFY_API_TOKEN:/);

  assert.match(
    workflowBody,
    /image_uri: \$\{\{ steps\.image\.outputs\.image_uri \}\}/,
  );
  assert.match(
    workflowBody,
    /SERVER_IMAGE_URI: \$\{\{ needs\.build-server\.outputs\.image_uri \}\}/,
  );
  assert.match(
    workflowBody,
    /AI_IMAGE_URI: \$\{\{ needs\.build-ai\.outputs\.image_uri \}\}/,
  );
  assert.match(
    workflowBody,
    /SERVER_CHANGED: \$\{\{ needs\.changes\.outputs\.server \}\}/,
  );
  assert.match(
    workflowBody,
    /AI_CHANGED: \$\{\{ needs\.changes\.outputs\.ai \}\}/,
  );
  assert.match(
    workflowBody,
    /needs: \[changes, validate-config, build-server, build-ai\]/,
  );
  assert.match(workflowBody, /Trigger Coolify deployment\(s\)/);
  assert.match(workflowBody, /node \.github\/scripts\/deploy-image\.mjs/);
  assert.match(workflowBody, /DEPLOY_IMAGE_TAG="\$image_tag"/);
  assert.doesNotMatch(workflowBody, /aws ecs/);
  assert.doesNotMatch(workflowBody, /ECS_CLUSTER/);
  assert.doesNotMatch(workflowBody, /ECS_SERVICE/);
}

function assertExternalActionsArePinned(workflowBody) {
  for (const [, action, ref] of workflowBody.matchAll(
    /^\s+uses:\s+([^./\s][^@\s]*)@([^\s#]+)/gm,
  )) {
    assert.match(
      ref,
      /^[0-9a-f]{40}$/,
      `${action} must be pinned to a full commit SHA`,
    );
  }
}

test("backend workflow deploys changed images through Coolify once", async () => {
  const body = await workflow("backend-build.yml");

  assert.match(body, /workflow_call:/);
  assert.doesNotMatch(body, /^  push:/m);
  assert.doesNotMatch(body, /^  workflow_dispatch:/m);
  assert.match(body, /ref: \$\{\{ inputs\.source_sha \}\}/);
  assert.match(body, /Detect Backend Changes/);
  assert.match(body, /SERVER_CHANGED: \$\{\{ inputs\.server_changed \}\}/);
  assert.match(body, /AI_CHANGED: \$\{\{ inputs\.ai_changed \}\}/);
  assert.match(body, /Build and Push Server Image/);
  assert.match(body, /Build and Push AI Image/);
  assert.match(body, /Smoke test pushed server image manifest/);
  assert.match(body, /Smoke test pushed AI image manifest/);
  assert.match(
    body,
    /build-server:[\s\S]*?permissions:\s*\n\s+id-token: write[\s\S]*?environment:\s*\n\s+name: production-backend/,
  );
  assert.match(
    body,
    /build-ai:[\s\S]*?permissions:\s*\n\s+id-token: write[\s\S]*?environment:\s*\n\s+name: production-backend/,
  );
  assertExternalActionsArePinned(body);
  assertCoolifyDeploys(body);
});

test("MCP workflow deploys through Coolify API resource UUID", async () => {
  const body = await workflow("deploy-mcp-server.yml");

  assert.match(body, /workflow_call:/);
  assert.doesNotMatch(body, /^  push:/m);
  assert.doesNotMatch(body, /^  workflow_dispatch:/m);
  assert.match(body, /ref: \$\{\{ inputs\.source_sha \}\}/);
  assert.match(body, /COOLIFY_API_URL: \$\{\{ vars\.COOLIFY_API_URL \}\}/);
  assert.match(
    body,
    /COOLIFY_QUICKVOICE_MCP_RESOURCE_UUID: \$\{\{ vars\.COOLIFY_QUICKVOICE_MCP_RESOURCE_UUID \}\}/,
  );
  assert.doesNotMatch(body, /REQUIRED_COOLIFY_API_TOKEN:/);
  assert.match(body, /^permissions:\n  contents: read\n\n/m);
  assert.match(
    body,
    /security-audit:[\s\S]*?runs-on: ubuntu-latest[\s\S]*?pnpm install --frozen-lockfile/,
  );
  assert.match(
    body,
    /build-and-push:[\s\S]*?permissions:\s*\n\s+contents: read\s*\n\s+id-token: write[\s\S]*?environment:\s*\n\s+name: production-mcp-server/,
  );
  assertExternalActionsArePinned(body);
  assert.match(body, /Trigger Coolify deployment/);
  assert.match(body, /DEPLOY_IMAGE_TAG="\$MCP_IMAGE_TAG" node \.github\/scripts\/deploy-image\.mjs/);
  assert.doesNotMatch(body, /MCP_COOLIFY_WEBHOOK_URL/);
});

test("production backend and MCP deploy only after the main CI quality gate", async () => {
  const ci = await workflow("ci.yml");

  assert.match(ci, /deployment-changes:[\s\S]*needs: quality-summary/);
  assert.match(
    ci,
    /\(github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\) && github\.ref == 'refs\/heads\/main'/,
  );
  assert.match(ci, /current_main="\$\(git rev-parse origin\/main\)"/);
  assert.match(ci, /if \[ "\$current_main" != "\$SOURCE_SHA" \]/);
  assert.match(ci, /deploy-backend:[\s\S]*needs: deployment-changes/);
  assert.match(
    ci,
    /deploy-backend:[\s\S]*vars\.PRODUCTION_ENVIRONMENTS_PROTECTED == 'true'/,
  );
  assert.match(ci, /uses: \.\/\.github\/workflows\/backend-build\.yml/);
  assert.match(ci, /deploy-mcp:[\s\S]*needs: deployment-changes/);
  assert.match(
    ci,
    /deploy-mcp:[\s\S]*vars\.PRODUCTION_ENVIRONMENTS_PROTECTED == 'true'/,
  );
  assert.match(ci, /uses: \.\/\.github\/workflows\/deploy-mcp-server\.yml/);
  assert.match(ci, /source_sha: \$\{\{ github\.sha \}\}/);
});

test("AI hotfix workflow triggers Coolify instead of ECS", async () => {
  const body = await workflow("quickvoice-ai-hotfix-deploy.yml");

  assert.match(body, /COOLIFY_API_URL: \$\{\{ vars\.COOLIFY_API_URL \}\}/);
  assert.match(
    body,
    /COOLIFY_QUICKVOICE_AI_RESOURCE_UUID: \$\{\{ vars\.COOLIFY_QUICKVOICE_AI_RESOURCE_UUID \}\}/,
  );
  assert.match(body, /Trigger Coolify AI deployment/);
  assert.match(body, /if: vars\.PRODUCTION_ENVIRONMENTS_PROTECTED == 'true'/);
  assert.match(
    body,
    /deploy\?uuid=\$\{COOLIFY_QUICKVOICE_AI_RESOURCE_UUID\}&force=false/,
  );
  assert.doesNotMatch(body, /aws ecs/);
  assert.doesNotMatch(body, /ECS_CLUSTER/);
  assert.doesNotMatch(body, /ECS_SERVICE/);
});

test("docs dependencies build without OIDC and only the protected deploy job can mint it", async () => {
  const body = await workflow("deploy-docs.yml");

  assert.match(body, /^permissions:\n  contents: read\n\n/m);
  assert.match(
    body,
    /build:[\s\S]*?pnpm install --frozen-lockfile[\s\S]*?Upload verified docs artifact/,
  );
  assert.match(
    body,
    /build:[\s\S]*?vars\.PRODUCTION_ENVIRONMENTS_PROTECTED == 'true'/,
  );
  assert.match(
    body,
    /deploy:[\s\S]*?permissions:\s*\n\s+contents: read\s*\n\s+id-token: write[\s\S]*?environment:\s*\n\s+name: production-docs/,
  );
  assert.match(
    body,
    /deploy:[\s\S]*?Download verified docs artifact[\s\S]*?Configure AWS credentials/,
  );
  assertExternalActionsArePinned(body);
});

test("manual website deployment is protected and its actions are pinned", async () => {
  const body = await workflow("deploy-web.yml");

  assert.match(
    body,
    /deploy-web:[\s\S]*?environment:\s*\n\s+name: production-web/,
  );
  assert.match(
    body,
    /deploy-web:[\s\S]*?vars\.PRODUCTION_ENVIRONMENTS_PROTECTED == 'true'/,
  );
  assertExternalActionsArePinned(body);
});

test("legacy split backend deploy workflows are removed", async () => {
  await assert.rejects(
    access(new URL("../.github/workflows/server-build.yml", import.meta.url)),
    /ENOENT/,
  );
  await assert.rejects(
    access(new URL("../.github/workflows/ai-build.yml", import.meta.url)),
    /ENOENT/,
  );
});
