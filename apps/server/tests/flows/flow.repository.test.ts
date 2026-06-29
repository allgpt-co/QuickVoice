import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import {
  createFlow,
  updateFlow,
  type CreateFlowRepositoryInput,
  type UpdateFlowRepositoryInput,
} from "../../src/modules/flows/flow.repository.js";

const orgId = "org_123";
const flowId = "44444444-4444-4444-8444-444444444444";
const rootAgentId = "11111111-1111-4111-8111-111111111111";
const migrationsDir = new URL("../../prisma/migrations/", import.meta.url);

const graphJson = {
  version: 1 as const,
  nodes: [
    {
      id: "start",
      type: "start" as const,
      position: { x: 0, y: 0 },
      data: { label: "General", agentId: rootAgentId },
    },
  ],
  edges: [],
};

const createInput: CreateFlowRepositoryInput = {
  flowId,
  organizationId: orgId,
  userId: "user_123",
  rootAgentId,
  name: "Support flow",
  graphJson,
  compiledJson: null,
  isActive: true,
};

test("createFlow transaction deactivates other active flows before creating active flow", async () => {
  const calls: unknown[] = [];
  const client = {
    $transaction: async (callback: any) =>
      callback({
        agentFlow: {
          updateMany: async (args: unknown) => {
            calls.push(["updateMany", args]);
            return { count: 1 };
          },
          create: async (args: unknown) => {
            calls.push(["create", args]);
            return args;
          },
        },
      }),
  };

  await createFlow(createInput, client as any);

  assert.deepEqual(calls[0], [
    "updateMany",
    {
      where: { organizationId: orgId, rootAgentId },
      data: { isActive: false },
    },
  ]);
  assert.equal((calls[1] as any[])[0], "create");
});

test("updateFlow transaction deactivates sibling active flows before activating flow", async () => {
  const calls: unknown[] = [];
  const updateInput: UpdateFlowRepositoryInput = {
    rootAgentId,
    graphJson,
    compiledJson: null,
    isActive: true,
  };
  const client = {
    $transaction: async (callback: any) =>
      callback({
        agentFlow: {
          findFirst: async (args: unknown) => {
            calls.push(["findFirst", args]);
            return { rootAgentId };
          },
          updateMany: async (args: unknown) => {
            calls.push(["updateMany", args]);
            return { count: 1 };
          },
          update: async (args: unknown) => {
            calls.push(["update", args]);
            return args;
          },
        },
      }),
  };

  await updateFlow(orgId, flowId, updateInput, client as any);

  assert.deepEqual(calls[1], [
    "updateMany",
    {
      where: {
        organizationId: orgId,
        rootAgentId,
        flowId: { not: flowId },
      },
      data: { isActive: false },
    },
  ]);
  assert.equal((calls[2] as any[])[0], "update");
});

test("migrations enforce one active flow per root agent", () => {
  const migrationSql = readdirSync(migrationsDir)
    .filter((entry) => entry.includes("agent_flow_active_unique"))
    .map((entry) =>
      readFileSync(new URL(entry + "/migration.sql", migrationsDir), "utf8")
    )
    .join("\n");

  assert.match(
    migrationSql,
    /CREATE UNIQUE INDEX "AgentFlow_active_root_unique" ON "AgentFlow"\("organizationId", "rootAgentId"\) WHERE "isActive" = true;/
  );
});
