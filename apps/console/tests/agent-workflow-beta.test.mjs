import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

test("agent workflow beta entry point is fail-closed and explicit", () => {
  const tabs = read("components/agents/AgentTabs.tsx");
  const workflow = read("components/agents/tabs/WorkflowTab.tsx");

  assert.match(tabs, /Workflow beta/);
  assert.match(tabs, /<WorkflowTab agentId=\{agentId\}/);
  assert.match(workflow, /NEXT_PUBLIC_WORKFLOWS_BETA_ENABLED/);
  assert.match(workflow, /Enable workflow draft/);
  assert.match(workflow, /No silent conversion/);
  assert.doesNotMatch(workflow, /mutateAsync|apiClient|fetch\(/);
});
