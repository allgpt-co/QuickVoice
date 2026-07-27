import { test } from "node:test";
import assert from "node:assert/strict";

import {
  diffConnectorSchemas,
  shouldPauseMappingsForDrift,
  shouldRetryConnectorOperation,
  snapshotConnectorSchema,
  updateSyncCheckpoint,
  validateConnectorDefinition,
  validateFieldMappings,
  type ConnectorDefinition,
} from "../../src/modules/connectors/connector-contract.js";

const definition: ConnectorDefinition = {
  connectorId: "hubspot",
  version: "1.0.0",
  provider: "HubSpot",
  authMethods: ["oauth_pkce"],
  capabilities: ["read", "create_update"],
  objects: [{ objectType: "contact", fields: { id: "string", email: "string", updatedAt: "datetime" }, supportsIncrementalSync: true, supportsWebhooks: true }],
  requiredScopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"],
  rateLimitPerMinute: 100,
};

test("connector definitions declare auth, capabilities, scopes, and objects", () => {
  assert.deepEqual(validateConnectorDefinition(definition), []);
  assert.deepEqual(validateConnectorDefinition({ ...definition, connectorId: "", authMethods: [], capabilities: [], objects: [] }), ["connectorId is required", "at least one auth method is required", "at least one capability is required", "at least one object is required"]);
});

test("connector schema snapshots and drift detection flag destructive mapping changes", () => {
  const changed = { ...definition, objects: [{ objectType: "contact", fields: { id: "string", email: "email", firstName: "string" }, supportsIncrementalSync: true, supportsWebhooks: true }] };
  const drift = diffConnectorSchemas(definition, changed);

  assert.notEqual(snapshotConnectorSchema(definition).contentHash, snapshotConnectorSchema(changed).contentHash);
  assert.deepEqual(drift, [
    { objectType: "contact", field: "email", kind: "type_changed", previousType: "string", nextType: "email" },
    { objectType: "contact", field: "firstName", kind: "added", nextType: "string" },
    { objectType: "contact", field: "updatedAt", kind: "removed", previousType: "datetime" },
  ]);
  assert.deepEqual(shouldPauseMappingsForDrift(drift, [{ canonicalField: "customer.email", externalObjectType: "contact", externalField: "email", strategy: "source_of_truth" }]).map((mapping) => mapping.canonicalField), ["customer.email"]);
});

test("field mapping validation rejects unknown fields and high-risk silent strategies", () => {
  assert.deepEqual(validateFieldMappings(definition, [{ canonicalField: "customer.email", externalObjectType: "contact", externalField: "email", strategy: "source_of_truth" }]), []);
  assert.deepEqual(validateFieldMappings(definition, [{ canonicalField: "financial.delete_card", externalObjectType: "contact", externalField: "missing", strategy: "last_write" }]), ["financial.delete_card maps to unknown field missing", "financial.delete_card requires manual review strategy"]);
});

test("sync checkpoints dedupe external IDs and connector retry policy respects risk/idempotency", () => {
  assert.deepEqual(updateSyncCheckpoint({ connectionId: "conn_1", objectType: "contact", processedExternalIds: ["a"] }, { cursor: "cur_2", externalIds: ["b", "a"] }).processedExternalIds, ["a", "b"]);
  assert.deepEqual(shouldRetryConnectorOperation({ capability: "read", idempotent: false, status: 429, attempt: 1, maxAttempts: 3 }), { retry: true, reason: "retryable_provider_response" });
  assert.deepEqual(shouldRetryConnectorOperation({ capability: "delete", idempotent: false, status: 500, attempt: 1, maxAttempts: 3 }), { retry: false, reason: "high_risk_not_idempotent" });
});
