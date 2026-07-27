import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAgentSchema,
  updateAgentSchema,
  configureAgentSchema,
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
  assert.equal(
    uuidTemplate.templateId,
    "8d55565f-1111-4111-8111-f95fd03f0df2"
  );

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
    /Invalid template ID/
  );
});

test("updateAgentSchema accepts partial template slug updates", () => {
  const parsed = updateAgentSchema.parse({ templateId: "business" });
  assert.equal(parsed.templateId, "business");
});


test("configureAgentSchema defaults IVR navigation on", () => {
  const parsed = configureAgentSchema.parse({
    agent_language: "en",
    firstMessage: "Hello from the agent.",
    systemPrompt: "You are a helpful assistant.",
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
  });

  assert.equal(parsed.ivr_navigation_enabled, true);
});

test("configureAgentSchema defaults evaluation checks to deterministic and accepts AI-judged checks", () => {
  const parsed = configureAgentSchema.parse({
    agent_language: "en",
    firstMessage: "Hello from the agent.",
    systemPrompt: "You are a helpful assistant.",
    llmModel: "gpt-4o-mini",
    sttModel: "nova-3",
    ttsModel: "aura-2",
    use_rag: false,
    voiceId: "aura-2-asteria-en",
    data_needed: [],
    data_evaluation: [
      { id: "identity", name: "Identity confirmed", criteria: "Caller identity was confirmed." },
      {
        id: "tone",
        name: "Empathetic tone",
        criteria: "Agent responded empathetically.",
        evaluationType: "probabilistic",
      },
    ],
    initiation_webhook: null,
    post_call_webhook: null,
    preemptive_generation: false,
    timezone: "UTC",
  });

  assert.equal(parsed.data_evaluation[0]?.evaluationType, "deterministic");
  assert.equal(parsed.data_evaluation[1]?.evaluationType, "probabilistic");
});
