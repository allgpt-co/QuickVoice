import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Dev Container declares supported contributor tooling without credentials", async () => {
  const config = JSON.parse(await text(".devcontainer/devcontainer.json"));
  const readme = await text(".devcontainer/README.md");
  const workflow = await text(".github/workflows/devcontainer.yml");

  assert.equal(config.name, "QuickVoice Contributor");
  assert.equal(config.features["ghcr.io/devcontainers/features/node:1"].version, "24");
  assert.equal(config.features["ghcr.io/devcontainers/features/python:1"].version, "3.12");
  assert.ok(config.features["ghcr.io/devcontainers/features/docker-outside-of-docker:1"]);
  assert.match(config.postCreateCommand, /corepack prepare pnpm@9\.0\.0 --activate/);
  assert.match(config.postCreateCommand, /go install github\.com\/go-task\/task\/v3\/cmd\/task@latest/);
  assert.doesNotMatch(JSON.stringify(config), /LIVEKIT_API_SECRET|TWILIO_AUTH_TOKEN|STRIPE_SECRET_KEY|AWS_SECRET_ACCESS_KEY/);
  assert.match(readme, /does not embed provider credentials/);
  assert.match(readme, /provider boundaries/);
  assert.match(workflow, /paths:/);
  assert.match(workflow, /@devcontainers\/cli read-configuration/);
  assert.match(workflow, /@devcontainers\/cli build/);
  assert.match(workflow, /node-version: "24"/);
});
