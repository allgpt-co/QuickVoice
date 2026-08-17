import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function workflow(path) {
  return readFile(new URL(`../.github/workflows/${path}`, import.meta.url), "utf8");
}

function assertCoolifyDeploys(workflowBody) {
  assert.match(workflowBody, /group: quickvoice-backend-deploy-\$\{\{ github\.ref \}\}/);
  assert.match(workflowBody, /COOLIFY_API_URL: \$\{\{ vars\.COOLIFY_API_URL \}\}/);
  assert.match(workflowBody, /COOLIFY_QUICKVOICE_SERVER_RESOURCE_UUID: \$\{\{ vars\.COOLIFY_QUICKVOICE_SERVER_RESOURCE_UUID \}\}/);
  assert.match(workflowBody, /COOLIFY_QUICKVOICE_AI_RESOURCE_UUID: \$\{\{ vars\.COOLIFY_QUICKVOICE_AI_RESOURCE_UUID \}\}/);

  assert.match(workflowBody, /REQUIRED_COOLIFY_API_URL: \$\{\{ env\.COOLIFY_API_URL \}\}/);
  assert.match(workflowBody, /REQUIRED_COOLIFY_QUICKVOICE_SERVER_RESOURCE_UUID: \$\{\{ env\.COOLIFY_QUICKVOICE_SERVER_RESOURCE_UUID \}\}/);
  assert.match(workflowBody, /REQUIRED_COOLIFY_QUICKVOICE_AI_RESOURCE_UUID: \$\{\{ env\.COOLIFY_QUICKVOICE_AI_RESOURCE_UUID \}\}/);
  assert.match(workflowBody, /REQUIRED_COOLIFY_API_TOKEN: \$\{\{ secrets\.COOLIFY_API_TOKEN \}\}/);

  assert.match(workflowBody, /image_uri: \$\{\{ steps\.image\.outputs\.image_uri \}\}/);
  assert.match(workflowBody, /SERVER_IMAGE_URI: \$\{\{ needs\.build-server\.outputs\.image_uri \}\}/);
  assert.match(workflowBody, /AI_IMAGE_URI: \$\{\{ needs\.build-ai\.outputs\.image_uri \}\}/);
  assert.match(workflowBody, /SERVER_CHANGED: \$\{\{ needs\.changes\.outputs\.server \}\}/);
  assert.match(workflowBody, /AI_CHANGED: \$\{\{ needs\.changes\.outputs\.ai \}\}/);
  assert.match(workflowBody, /needs: \[changes, validate-config, build-server, build-ai\]/);
  assert.match(workflowBody, /Trigger Coolify deployment\(s\)/);
  assert.match(workflowBody, /deploy\?uuid=\$\{resource_uuid\}&force=false/);
  assert.doesNotMatch(workflowBody, /aws ecs/);
  assert.doesNotMatch(workflowBody, /ECS_CLUSTER/);
  assert.doesNotMatch(workflowBody, /ECS_SERVICE/);
}

test("backend workflow deploys changed images through Coolify once", async () => {
  const body = await workflow("backend-build.yml");

  assert.match(body, /Detect Backend Changes/);
  assert.match(body, /server_changed=true/);
  assert.match(body, /ai_changed=true/);
  assert.match(body, /Build and Push Server Image/);
  assert.match(body, /Build and Push AI Image/);
  assert.match(body, /Smoke test pushed server image manifest/);
  assert.match(body, /Smoke test pushed AI image manifest/);
  assertCoolifyDeploys(body);
});

test("MCP workflow deploys through Coolify API resource UUID", async () => {
  const body = await workflow("deploy-mcp-server.yml");

  assert.match(body, /COOLIFY_API_URL: \$\{\{ vars\.COOLIFY_API_URL \}\}/);
  assert.match(body, /COOLIFY_QUICKVOICE_MCP_RESOURCE_UUID: \$\{\{ vars\.COOLIFY_QUICKVOICE_MCP_RESOURCE_UUID \}\}/);
  assert.match(body, /REQUIRED_COOLIFY_API_TOKEN: \$\{\{ secrets\.COOLIFY_API_TOKEN \}\}/);
  assert.match(body, /Trigger Coolify deployment/);
  assert.match(body, /deploy\?uuid=\$\{COOLIFY_RESOURCE_UUID\}&force=false/);
  assert.doesNotMatch(body, /MCP_COOLIFY_WEBHOOK_URL/);
});

test("AI hotfix workflow triggers Coolify instead of ECS", async () => {
  const body = await workflow("quickvoice-ai-hotfix-deploy.yml");

  assert.match(body, /COOLIFY_API_URL: \$\{\{ vars\.COOLIFY_API_URL \}\}/);
  assert.match(body, /COOLIFY_QUICKVOICE_AI_RESOURCE_UUID: \$\{\{ vars\.COOLIFY_QUICKVOICE_AI_RESOURCE_UUID \}\}/);
  assert.match(body, /Trigger Coolify AI deployment/);
  assert.match(body, /deploy\?uuid=\$\{COOLIFY_QUICKVOICE_AI_RESOURCE_UUID\}&force=false/);
  assert.doesNotMatch(body, /aws ecs/);
  assert.doesNotMatch(body, /ECS_CLUSTER/);
  assert.doesNotMatch(body, /ECS_SERVICE/);
});

test("legacy split backend deploy workflows are removed", async () => {
  await assert.rejects(
    access(new URL("../.github/workflows/server-build.yml", import.meta.url)),
    /ENOENT/
  );
  await assert.rejects(
    access(new URL("../.github/workflows/ai-build.yml", import.meta.url)),
    /ENOENT/
  );
});
