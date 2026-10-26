import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { assertMcpArguments } from "../../src/modules/mcp/mcp-tool-contract.js";

const calendarSchema = {
  type: "object", additionalProperties: false,
  properties: {
    start_date: { type: "string", format: "date" }, end_date: { type: "string", format: "date" },
    start_time_boundary: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
    end_time_boundary: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
    email_addresses: { type: "array", items: { type: "string", format: "email" } },
  },
};

test("the reported Calendar payload is rejected without renaming or removing arguments", () => {
  const args = { start_time: "2026-10-27T00:00:00", end_time: "2026-10-27T23:59:59", timezone: "UTC", calendar_ids: ["primary"], duration_minutes: 30 };
  const original = structuredClone(args);
  assert.throws(() => assertMcpArguments(calendarSchema, args), (error: any) => {
    assert.equal(error.code, "MCP_ARGUMENTS_INVALID");
    assert.equal(error.statusCode, 422);
    assert.equal(error.details.issues.length, 5);
    assert.deepEqual(error.details.inputSchema, calendarSchema);
    assert.ok(!JSON.stringify(error.details.issues).includes("2026-10-27"));
    return true;
  });
  assert.deepEqual(args, original);
  assert.doesNotThrow(() => assertMcpArguments(calendarSchema, { start_date: "2026-10-27", end_date: "2026-10-27", start_time_boundary: "00:00", end_time_boundary: "23:59" }));
});

test("validation supports nested provider contracts, local refs, enums, arrays and alternatives", () => {
  const schema = { type: "object", required: ["owner", "filter"], additionalProperties: false,
    $defs: { owner: { type: "object", required: ["id"], properties: { id: { type: "integer", minimum: 1 } }, additionalProperties: false } },
    properties: {
      owner: { $ref: "#/$defs/owner" },
      filter: { oneOf: [{ type: "string", enum: ["open", "closed"] }, { type: "array", minItems: 1, items: { type: "integer" } }] },
    },
  };
  for (const $schema of [undefined, "http://json-schema.org/draft-07/schema#", "https://json-schema.org/draft-07/schema", "https://json-schema.org/draft/2019-09/schema", "http://json-schema.org/draft/2019-09/schema#", "https://json-schema.org/draft/2020-12/schema", "https://json-schema.org/draft/2020-12/schema#"]) {
    const contract = { ...schema, ...($schema ? { $schema } : {}) };
    const original = structuredClone(contract);
    assert.doesNotThrow(() => assertMcpArguments(contract, { owner: { id: 2 }, filter: [1, 2] }));
    for (const args of [{ owner: { id: "2" }, filter: "open" }, { owner: { id: 2 }, filter: "other" }, { owner: { id: 2, extra: true }, filter: [] }]) {
      assert.throws(() => assertMcpArguments(contract, args), (error: any) => error.code === "MCP_ARGUMENTS_INVALID");
    }
    assert.deepEqual(contract, original);
  }
});

test("schemas sharing an id stay independent across cache eviction", () => {
  for (let index = 0; index < 70; index++) {
    assertMcpArguments({ $id: "https://provider.test/input", type: "object", properties: { id: { const: index } } }, { id: index });
  }
  assertMcpArguments({ $id: "https://provider.test/input", type: "object", properties: { id: { const: 0 } } }, { id: 0 });
  assert.throws(() => assertMcpArguments({ $id: "https://provider.test/input", type: "object", properties: { id: { const: 69 } } }, { id: 0 }),
    (error: any) => error.code === "MCP_ARGUMENTS_INVALID");
});

test("defaults are not inserted and malformed dates and times are rejected", () => {
  assert.throws(() => assertMcpArguments(calendarSchema, { start_date: "2026-02-30", start_time_boundary: "24:00" }));
  const args = {};
  assertMcpArguments({ type: "object", properties: { limit: { type: "integer", default: 10 } } }, args);
  assert.deepEqual(args, {});
});

test("missing, invalid, asynchronous and externally referenced contracts fail closed", () => {
  for (const schema of [null, undefined, { type: "not-a-type" }, { $async: true, type: "object" }, { $ref: "https://attacker.test/private-schema" }, { description: "x".repeat(70_000) }]) {
    assert.throws(() => assertMcpArguments(schema, {}), (error: any) => error.code === "MCP_SCHEMA_UNAVAILABLE");
  }
});

test("untrusted regular expressions cannot stall validation indefinitely", () => {
  const module = new URL("../../src/modules/mcp/mcp-tool-contract.ts", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { assertMcpArguments } from ${JSON.stringify(module)};
    try { assertMcpArguments({type:'object', properties:{text:{type:'string',pattern:'^(a+)+$'}}}, {text:'a'.repeat(4000)+'!'}); process.exitCode=1; }
    catch(error) { if(error.code!=='MCP_SCHEMA_UNAVAILABLE') throw error; }
  `], { cwd: process.cwd(), encoding: "utf8", timeout: 4000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});

test("validation does not fetch external refs or accept oversized inputs", () => {
  assert.throws(() => assertMcpArguments({ type: "object" }, { text: "x".repeat(9000) }),
    (error: any) => error.code === "MCP_ARGUMENTS_INVALID");
  assert.throws(() => assertMcpArguments({ type: "object", required: ["secret"] }, {}),
    (error: any) => error.details.issues[0].field === "secret");
});
