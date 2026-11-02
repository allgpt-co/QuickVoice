import assert from "node:assert/strict";
import { test } from "node:test";
import {
  composioTool,
  matchesComposioToolkit,
  composioPages,
  safeComposioSetupUrl,
  composioRequest,
} from "../../src/modules/mcp/composio.client.js";
import { assertMcpArguments } from "../../src/modules/mcp/mcp-tool-contract.js";

test("Composio schemas preserve nested constraints, required flags and destructive tags", () => {
  const tool = composioTool(
    {
      slug: "CALENDAR_READ",
      toolkit: { slug: "calendar" },
      tags: ["readOnlyHint"],
      input_parameters: {
        date: { type: "string", format: "date", required: true },
        filter: {
          type: "object",
          properties: { limit: { type: "integer", minimum: 1 } },
          additionalProperties: false,
        },
      },
    },
    "calendar",
  )!;
  assertMcpArguments(tool.inputSchema, {
    date: "2026-10-29",
    filter: { limit: 2 },
  });
  for (const args of [
    {},
    { date: "tomorrow" },
    { date: "2026-10-29", filter: { limit: 0 } },
    { date: "2026-10-29", invented: true },
  ]) {
    assert.throws(() => assertMcpArguments(tool.inputSchema, args));
  }
  const write = composioTool(
    {
      slug: "CALENDAR_WRITE",
      toolkit: { slug: "calendar" },
      tags: ["readOnlyHint", "createHint"],
      input_parameters: { type: "object" },
    },
    "calendar",
  )!;
  assert.equal(write.requiresConfirmation, true);
  assert.equal(
    composioTool(
      { slug: "OTHER_TOOL", toolkit: { slug: "other" } },
      "calendar",
    ),
    null,
  );
  assert.equal(
    composioTool(
      { slug: "COMPOSIO_MANAGE_CONNECTIONS", toolkit: { slug: "calendar" } },
      "calendar",
    ),
    null,
  );
  const missingSchema = composioTool(
    { slug: "CALENDAR_READ", toolkit: { slug: "calendar" } },
    "calendar",
  )!;
  assert.throws(() => assertMcpArguments(missingSchema.inputSchema, {}));
});

test("catalog pagination handles every page and fails on a repeated cursor", async (t) => {
  const key = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = "local-test";
  t.after(() => {
    if (key === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = key;
  });
  let repeated = false;
  t.mock.method(globalThis, "fetch", async (url) =>
    Response.json({
      items: [{ slug: String(url).includes("cursor=") ? "second" : "first" }],
      next_cursor: !String(url).includes("cursor=") || repeated ? "next" : null,
    }),
  );
  assert.deepEqual(
    (await composioPages("/toolkits?limit=1")).map((item) => item.slug),
    ["first", "second"],
  );
  repeated = true;
  await assert.rejects(composioPages("/toolkits?limit=1"), /completely/);
});

test("provider failures are sanitized, not retried, and cannot redirect the API key", async (t) => {
  const key = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = "local-test";
  t.after(() => {
    if (key === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = key;
  });
  const fetch = t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(options?.redirect, "error");
    return Response.json(
      { error: { message: "PRIVATE_TOKEN" } },
      { status: 502 },
    );
  });
  await assert.rejects(
    composioRequest("/tool_router/session/session/execute", {}),
    (error) => !String(error).includes("PRIVATE_TOKEN"),
  );
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(
    safeComposioSetupUrl("https://connect.composio.dev/link/token"),
    "https://connect.composio.dev/link/token",
  );
  for (const url of [
    "https://evil.example/",
    "http://connect.composio.dev/",
    "https://key@connect.composio.dev/",
    "javascript:alert(1)",
  ])
    assert.throws(() => safeComposioSetupUrl(url));
});

test("toolkit matching accepts case variants without accepting unrelated or malformed toolkits", () => {
  for (const slug of ["GMAIL", "Gmail", "gmail"]) {
    assert.equal(matchesComposioToolkit(slug, "gmail"), true);
    const tool = composioTool(
      {
        slug: "GMAIL_ADD_LABEL_TO_EMAIL",
        toolkit: { slug },
        input_parameters: { type: "object", properties: {} },
        tags: ["updateHint"],
      },
      "gmail",
    );
    assert.equal(tool?.name, "GMAIL_ADD_LABEL_TO_EMAIL");
    assert.equal(tool?.requiresConfirmation, true);
  }
  for (const slug of [
    undefined,
    null,
    123,
    {},
    "",
    " gmail",
    "gmail.other",
    "NOTION",
  ]) {
    assert.equal(matchesComposioToolkit(slug, "gmail"), false);
    assert.equal(
      composioTool({ slug: "GMAIL_READ", toolkit: { slug } }, "gmail"),
      null,
    );
  }
  assert.equal(matchesComposioToolkit("", ""), false);
  assert.equal(matchesComposioToolkit("gmail", "GMAIL"), true);
});

// Synthetic tool schemas exercise the common adapter, not live provider access.
for (const toolkit of [
  "gmail",
  "notion",
  "slack",
  "github",
  "googledrive",
  "googlecalendar",
  "canvas",
  "CUSTOM_QV_ABC123",
]) {
  test(`shared normalization handles toolkit casing for ${toolkit}`, () => {
    const name = `${toolkit.toUpperCase()}_TEST_TOOL`;
    const inputSchema = {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    };
    for (const expected of [toolkit.toLowerCase(), toolkit.toUpperCase()]) {
      for (const returned of [
        toolkit.toLowerCase(),
        toolkit.toUpperCase(),
        toolkit[0]!.toUpperCase() + toolkit.slice(1).toLowerCase(),
      ]) {
        const candidate = {
          slug: name,
          toolkit: { slug: returned },
          input_parameters: inputSchema,
          tags: ["readOnlyHint"],
        };
        const tool = composioTool(candidate, expected);
        assert.equal(tool?.name, name);
        assert.deepEqual(tool?.inputSchema, inputSchema);
        assert.equal(tool?.requiresConfirmation, false);
        assert.equal(
          composioTool(
            { ...candidate, tags: ["readOnlyHint", "updateHint"] },
            expected,
          )?.requiresConfirmation,
          true,
        );
        assert.equal(
          composioTool({ ...candidate, tags: [] }, expected)
            ?.requiresConfirmation,
          true,
        );
        assert.equal(
          composioTool({ ...candidate, is_deprecated: true }, expected),
          null,
        );
        assert.equal(
          composioTool(
            { ...candidate, slug: "COMPOSIO_MANAGE_CONNECTIONS" },
            expected,
          ),
          null,
        );
        assert.equal(
          composioTool(
            { ...candidate, toolkit: { slug: "UNRELATED" } },
            expected,
          ),
          null,
        );
      }
    }
  });
}
