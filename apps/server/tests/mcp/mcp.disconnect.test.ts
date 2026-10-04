import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { disconnectSmitheryConnection } from "../../src/modules/mcp/mcp.service.js";

const originalApiKey = process.env.SMITHERY_API_KEY;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.SMITHERY_API_KEY;
  else process.env.SMITHERY_API_KEY = originalApiKey;
});

test("Smithery disconnect sends an authenticated DELETE", async (t) => {
  process.env.SMITHERY_API_KEY = "test-smithery-key";
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 204 }),
  );

  await disconnectSmitheryConnection("quickvoice-prod", "org-123-gmail");

  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(
    fetch.mock.calls[0]?.arguments[0],
    "https://api.smithery.ai/connect/quickvoice-prod/org-123-gmail",
  );
  assert.deepEqual(fetch.mock.calls[0]?.arguments[1], {
    method: "DELETE",
    headers: { Authorization: "Bearer test-smithery-key" },
  });
});

test("Smithery disconnect treats an already-missing connection as success", async (t) => {
  process.env.SMITHERY_API_KEY = "test-smithery-key";
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );

  await disconnectSmitheryConnection("quickvoice-prod", "missing");
});

test("Smithery disconnect does not discard the local retry handle on rejection", async (t) => {
  process.env.SMITHERY_API_KEY = "test-smithery-key";
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ message: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }),
  );

  await assert.rejects(
    disconnectSmitheryConnection("quickvoice-prod", "org-123-gmail"),
    /Method not allowed/,
  );
});
