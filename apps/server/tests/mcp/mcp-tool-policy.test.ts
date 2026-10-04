import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mcpToolRequiresConfirmation,
  normalizeMcpTools,
} from "../../src/modules/mcp/mcp-tool-policy.js";

test("MCP synchronization preserves safety annotations", () => {
  assert.deepEqual(
    normalizeMcpTools([
      {
        name: "list_files",
        title: "List files",
        inputSchema: { type: "object" },
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      {
        name: "delete_file",
        requiresConfirmation: true,
        annotations: { destructiveHint: true },
      },
    ]),
    [
      {
        name: "list_files",
        description: "List files",
        requiresConfirmation: false,
        inputSchema: { type: "object" },
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      {
        name: "delete_file",
        description: "",
        inputSchema: null,
        annotations: { destructiveHint: true },
        requiresConfirmation: true,
      },
    ],
  );
});

test("autonomous MCP execution permits only explicitly read-only tools", () => {
  assert.equal(
    mcpToolRequiresConfirmation({ annotations: { readOnlyHint: true } }),
    false,
  );
  assert.equal(mcpToolRequiresConfirmation({ readOnly: true }), false);
  assert.equal(mcpToolRequiresConfirmation({}), true);
  assert.equal(
    mcpToolRequiresConfirmation({
      readOnly: true,
      annotations: { destructiveHint: true },
    }),
    true,
  );
});


test("legacy and ambiguous tools receive the same label as the execution policy", () => {
  const cases = [
    { name: "legacy" },
    { name: "false", readOnly: false },
    { name: "string", readOnly: "true", annotations: { readOnlyHint: "true" } },
    { name: "unknown", requiresConfirmation: false },
    { name: "destructive", readOnly: true, annotations: { destructiveHint: true } },
    { name: "write", readOnly: true, mode: "write" },
    { name: "explicit", readOnly: true },
    { name: "annotated", annotations: { readOnlyHint: true } },
  ];
  const normalized = normalizeMcpTools(cases);
  assert.deepEqual(normalized.map((tool) => tool.requiresConfirmation),
    [true, true, true, true, true, true, false, false]);
  for (let index = 0; index < cases.length; index++) {
    assert.equal(normalized[index]!.requiresConfirmation, mcpToolRequiresConfirmation(cases[index]!));
  }
  assert.deepEqual(normalizeMcpTools(normalized), normalized);
});
