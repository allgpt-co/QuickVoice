import test from "node:test";
import assert from "node:assert/strict";

import {
  flowGraphSchema,
  listFlowsQuerySchema,
  updateFlowSchema,
} from "../../src/modules/flows/flow.schema.js";

test("flow graph requires one start node", () => {
  const result = flowGraphSchema.safeParse({ version: 1, nodes: [], edges: [] });
  assert.equal(result.success, false);
});

test("agent node requires agentId", () => {
  const result = flowGraphSchema.safeParse({
    version: 1,
    nodes: [{ id: "n1", type: "agent", position: { x: 0, y: 0 }, data: { label: "Returns" } }],
    edges: [],
  });
  assert.equal(result.success, false);
});

test("flow graph rejects duplicate node ids", () => {
  const result = flowGraphSchema.safeParse({
    version: 1,
    nodes: [
      {
        id: "n1",
        type: "start",
        position: { x: 0, y: 0 },
        data: {
          label: "General",
          agentId: "11111111-1111-4111-8111-111111111111",
        },
      },
      {
        id: "n1",
        type: "agent",
        position: { x: 300, y: 0 },
        data: {
          label: "Returns",
          agentId: "22222222-2222-4222-8222-222222222222",
        },
      },
    ],
    edges: [],
  });
  assert.equal(result.success, false);
});

test("update flow schema rejects empty updates", () => {
  const result = updateFlowSchema.safeParse({});
  assert.equal(result.success, false);
});

test("update flow schema does not default isActive on partial updates", () => {
  const result = updateFlowSchema.safeParse({ name: "Renamed flow" });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data, { name: "Renamed flow" });
});

test("list flows query validates rootAgentId as uuid", () => {
  const result = listFlowsQuerySchema.safeParse({ rootAgentId: "not-a-uuid" });
  assert.equal(result.success, false);
});
