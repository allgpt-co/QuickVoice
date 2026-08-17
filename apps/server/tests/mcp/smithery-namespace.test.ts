import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestError } from "../../src/common/errors/badRequest.js";
import { resolveSmitheryNamespace } from "../../src/modules/mcp/smithery-namespace.js";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("uses an accessible namespace instead of an unavailable product default", async () => {
  const requests: string[] = [];
  const namespace = await resolveSmitheryNamespace({
    apiBaseUrl: "https://api.smithery.test",
    apiKey: "test-key",
    preferredNamespace: "quickvoice",
    fetcher: async (input) => {
      requests.push(String(input));
      return jsonResponse({ namespaces: [{ name: "team-workspace" }] });
    },
  });

  assert.equal(namespace, "team-workspace");
  assert.deepEqual(requests, ["https://api.smithery.test/namespaces"]);
});

test("creates the preferred namespace when the API key has no namespaces", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const namespace = await resolveSmitheryNamespace({
    apiBaseUrl: "https://api.smithery.test/",
    apiKey: "test-key",
    preferredNamespace: "quickvoice-dev",
    fetcher: async (input, init) => {
      requests.push({ url: String(input), method: init?.method ?? "GET" });
      if (requests.length === 1) return jsonResponse({ namespaces: [] });
      return jsonResponse({ name: "quickvoice-dev" }, 201);
    },
  });

  assert.equal(namespace, "quickvoice-dev");
  assert.deepEqual(requests, [
    { url: "https://api.smithery.test/namespaces", method: "GET" },
    {
      url: "https://api.smithery.test/namespaces/quickvoice-dev",
      method: "PUT",
    },
  ]);
});

test("falls back to an auto-generated namespace when the preferred name is taken", async () => {
  const namespace = await resolveSmitheryNamespace({
    apiBaseUrl: "https://api.smithery.test",
    apiKey: "test-key",
    preferredNamespace: "quickvoice",
    fetcher: async (_input, init) => {
      if (!init?.method) return jsonResponse({ namespaces: [] });
      if (init.method === "PUT") {
        return jsonResponse({ message: "Namespace already exists" }, 409);
      }
      return jsonResponse({ name: "bright-otter" }, 201);
    },
  });

  assert.equal(namespace, "bright-otter");
});

test("returns a product-facing configuration error for invalid Smithery credentials", async () => {
  await assert.rejects(
    resolveSmitheryNamespace({
      apiBaseUrl: "https://api.smithery.test",
      apiKey: "expired",
      fetcher: async () =>
        jsonResponse(
          { message: "Invalid credentials or namespace not found" },
          401
        ),
    }),
    (error: unknown) =>
      error instanceof BadRequestError &&
      /Ask an administrator to verify the Smithery API key/.test(error.message)
  );
});
