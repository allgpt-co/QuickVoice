import assert from "node:assert/strict";
import test from "node:test";

import { apiGroups } from "../apps/docs/src/data/api-reference.ts";
import { apiDefinitions } from "../apps/mcp-server/src/api-registry.ts";

const mcpDefinition = (name) => {
  const definition = apiDefinitions.find(
    (candidate) => candidate.name === name,
  );
  assert.ok(definition, `Missing MCP registry definition: ${name}`);
  return definition;
};

const docsEndpoint = (method, path) => {
  const phoneNumbers = apiGroups.find(
    (group) => group.slug === "phone-numbers",
  );
  assert.ok(phoneNumbers, "Missing phone-number API reference group");
  const endpoint = phoneNumbers.endpoints.find(
    (candidate) => candidate.method === method && candidate.path === path,
  );
  assert.ok(endpoint, `Missing docs endpoint: ${method} ${path}`);
  return endpoint;
};

test("hosted number search documents every field needed for signed purchase", () => {
  const mcpSearch = mcpDefinition("search_phone_numbers");
  for (const field of [
    "providerMonthlyCostMicros",
    "monthlyPriceMicros",
    "quoteId",
    "quoteExpiresAt",
    "rateCatalogVersion",
  ]) {
    assert.match(mcpSearch.responseSchema, new RegExp(field));
    assert.match(
      docsEndpoint("GET", "/numbers/search").response,
      new RegExp(field),
    );
  }
});

test("phone purchase requires a signed quote and is not exposed as an MCP tool", () => {
  const purchase = mcpDefinition("buy_phone_number");
  assert.equal(purchase.kind, "excluded");
  assert.match(purchase.auth, /owner\/admin session only/);
  assert.match(purchase.auth, /billing:manage/);
  assert.match(purchase.requestSchema, /quoteId/);
  assert.match(purchase.excludedReason ?? "", /MCP callers cannot purchase/);

  const bodySchema = purchase.toolSchema?.body;
  assert.ok(bodySchema && "safeParse" in bodySchema);
  assert.equal(
    bodySchema.safeParse({ provider: "TWILIO", phoneNumber: "+14155550123" })
      .success,
    false,
  );
  assert.equal(
    bodySchema.safeParse({
      provider: "TWILIO",
      phoneNumber: "+14155550123",
      quoteId: "signed-quote",
    }).success,
    true,
  );

  const docsPurchase = docsEndpoint("POST", "/numbers");
  assert.equal(docsPurchase.auth, "Owner/admin session only");
  assert.match(docsPurchase.permission ?? "", /phoneNumber:create/);
  assert.match(docsPurchase.permission ?? "", /billing:manage/);
  assert.ok(docsPurchase.body?.some((field) => field.startsWith("quoteId:")));
});

test("session-only assignment and release are excluded from API-key MCP tools", () => {
  for (const name of ["assign_phone_number", "delete_phone_number"]) {
    const definition = mcpDefinition(name);
    assert.equal(definition.kind, "excluded");
    assert.match(definition.auth, /owner\/admin session only/);
    assert.match(definition.auth, /billing:manage/);
  }

  for (const [method, path] of [
    ["PATCH", "/numbers/{phId}"],
    ["DELETE", "/numbers/{phId}"],
  ]) {
    const endpoint = docsEndpoint(method, path);
    assert.equal(endpoint.auth, "Owner/admin session only");
    assert.match(endpoint.permission ?? "", /billing:manage/);
  }
});
