import assert from "node:assert/strict";
import { test } from "node:test";

import { configureAgentSchema } from "../../src/modules/agent/agent.schema.js";
import { templateConfigFor } from "../../src/modules/agent/agent.templates.js";

test("configured agent templates produce valid agent configuration", () => {
  for (const templateId of ["business", "medical", "support"] as const) {
    const config = templateConfigFor(templateId);

    assert.ok(config, `${templateId} should have a starter configuration`);
    assert.doesNotThrow(() => configureAgentSchema.parse(config));
    assert.equal(config.agent_language, "en");
    assert.equal(
      config.llmModel,
      "bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0",
    );
    assert.equal(config.sttModel, "deepgram/nova-3");
    assert.equal(config.ttsModel, "deepgram/aura-2");
    assert.equal(config.voiceId, "aura-2-asteria-en");
    assert.ok(config.firstMessage.length >= 5);
    assert.ok(config.systemPrompt.length >= 10);
  }
});

test("blank template does not create starter configuration", () => {
  assert.equal(templateConfigFor("blank"), null);
  assert.equal(templateConfigFor(null), null);
  assert.equal(templateConfigFor("8d55565f-1111-4111-8111-f95fd03f0df2"), null);
});

test("template configs are cloned before returning", () => {
  const first = templateConfigFor("business");
  assert.ok(first);
  first.data_needed.push({
    id: "extra",
    type: "String",
    name: "Extra",
    description: "Temporary mutation used by the test",
  });

  const second = templateConfigFor("business");
  assert.ok(second);
  assert.equal(
    second.data_needed.some((item) => item.id === "extra"),
    false
  );
});
