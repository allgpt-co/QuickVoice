import assert from "node:assert/strict";
import { test } from "node:test";

import {
  configureAgentSchema,
  createAgentSchema,
  updateAgentSchema,
} from "../../src/modules/agent/agent.schema.js";

test("createAgentSchema accepts console template slugs", () => {
  for (const templateId of ["blank", "business", "medical", "support"]) {
    const parsed = createAgentSchema.parse({
      name: "Sales Qualifier",
      isActive: true,
      templateId,
    });

    assert.equal(parsed.templateId, templateId);
  }
});

test("createAgentSchema still accepts null and UUID template ids", () => {
  const uuidTemplate = createAgentSchema.parse({
    name: "Support Agent",
    isActive: true,
    templateId: "8d55565f-1111-4111-8111-f95fd03f0df2",
  });
  assert.equal(uuidTemplate.templateId, "8d55565f-1111-4111-8111-f95fd03f0df2");

  const nullTemplate = createAgentSchema.parse({
    name: "Blank Agent",
    isActive: true,
    templateId: null,
  });
  assert.equal(nullTemplate.templateId, null);
});

test("createAgentSchema rejects unknown template strings", () => {
  assert.throws(
    () =>
      createAgentSchema.parse({
        name: "Bad Template",
        isActive: true,
        templateId: "not-a-real-template",
      }),
    /Invalid template ID/,
  );
});

test("updateAgentSchema accepts partial template slug updates", () => {
  const parsed = updateAgentSchema.parse({ templateId: "business" });
  assert.equal(parsed.templateId, "business");
});

const validConfiguration = {
  agent_language: "en",
  firstMessage: "Hello there",
  systemPrompt: "You are a concise support agent.",
  llmModel: "gpt-4o-mini",
  sttModel: "nova-3",
  ttsModel: "aura-2",
  use_rag: false,
  voiceId: "aura-2-asteria-en",
  data_needed: [],
  data_evaluation: [],
  initiation_webhook: null,
  post_call_webhook: null,
  preemptive_generation: false,
  timezone: "UTC",
};

test("configureAgentSchema defaults IVR navigation on", () => {
  const parsed = configureAgentSchema.parse(validConfiguration);

  assert.equal(parsed.ivr_navigation_enabled, true);
});

test("configureAgentSchema accepts bounded privacy controls", () => {
  const parsed = configureAgentSchema.parse({
    ...validConfiguration,
    store_call_audio: false,
    zero_pii_retention: true,
    conversation_retention_days: 365,
  });

  assert.equal(parsed.zero_pii_retention, true);
  assert.equal(parsed.conversation_retention_days, 365);
});

test("configureAgentSchema rejects incompatible or unbounded retention settings", () => {
  assert.equal(
    configureAgentSchema.safeParse({
      ...validConfiguration,
      store_call_audio: true,
      zero_pii_retention: true,
      conversation_retention_days: 30,
    }).success,
    false,
  );
  assert.equal(
    configureAgentSchema.safeParse({
      ...validConfiguration,
      conversation_retention_days: 3_651,
    }).success,
    false,
  );
});

test("configureAgentSchema accepts only marked redacted webhook placeholders", () => {
  const redacted = configureAgentSchema.safeParse({
    ...validConfiguration,
    initiation_webhook: {
      webhook_url: "https://example.test/init",
      method: "POST",
      headers: {
        Authorization: {
          type: "Secret",
          value: null,
          redacted: true,
        },
      },
    },
  });
  assert.equal(redacted.success, true);

  const unmarked = configureAgentSchema.safeParse({
    ...validConfiguration,
    initiation_webhook: {
      webhook_url: "https://example.test/init",
      method: "POST",
      headers: {
        Authorization: {
          type: "Secret",
          value: null,
        },
      },
    },
  });
  assert.equal(unmarked.success, false);
});
