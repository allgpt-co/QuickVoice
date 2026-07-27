import assert from "node:assert/strict";
import { test } from "node:test";

import { swaggerSpec } from "../../src/config/swagger.js";

const spec = swaggerSpec as any;

test("OpenAPI documents billing, batch campaigns, and destructive agent cleanup", () => {
  for (const path of [
    "/billing/usage",
    "/outbound-calls/batch-upload-url",
    "/outbound-calls/batches",
    "/outbound-calls/batches/{campaignId}",
    "/kb/{kbId}/retry",
  ]) {
    assert.ok(spec.paths[path], `missing OpenAPI path: ${path}`);
  }

  assert.ok(spec.paths["/agents/{id}"].delete);
  assert.ok(spec.tags.some((tag: { name: string }) => tag.name === "Billing"));
});

test("OpenAPI upload and privacy contracts match runtime validation", () => {
  for (const path of ["/kb/upload-url", "/outbound-calls/batch-upload-url"]) {
    const parameters = spec.paths[path].get.parameters;
    const fileSize = parameters.find(
      (parameter: { name: string }) => parameter.name === "fileSize",
    );
    assert.equal(fileSize?.required, true);
    assert.equal(fileSize?.schema.minimum, 1);
  }

  const configProperties =
    spec.components.schemas.ConfigureAgentRequest.properties;
  assert.ok(configProperties.store_call_audio);
  assert.ok(configProperties.zero_pii_retention);
  assert.equal(configProperties.conversation_retention_days.maximum, 3650);

  const sourceTypes =
    spec.components.schemas.KbDocument.properties.sourceType.enum;
  assert.ok(sourceTypes.includes("XLSX"));
  assert.ok(sourceTypes.includes("XLS"));
});
