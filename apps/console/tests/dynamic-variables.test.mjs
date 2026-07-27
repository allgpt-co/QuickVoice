import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function text(path) {
  return readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
}

function extractRegexLiteral(source) {
  const match = source.match(/const DYNAMIC_VARIABLE_REGEX = \/(.+)\/([a-z]*);/);
  assert.ok(match, "dynamic variable regex should be declared as a literal");
  return new RegExp(match[1], match[2]);
}

function extractNames(value, regex) {
  const names = new Set();
  for (const match of value.matchAll(regex)) {
    names.add(match[1]);
  }
  return [...names];
}

test("dynamic variable regex extracts unique double-brace names", async () => {
  const source = await text("apps/console/src/lib/agents/dynamic-variables.ts");
  const regex = extractRegexLiteral(source);

  assert.deepEqual(
    extractNames(
      "Hi {{first_name}}, call {{ account_id }} about {{first_name}} and ignore {bad}.",
      regex
    ),
    ["first_name", "account_id"]
  );
  assert.deepEqual(extractNames("Skip {{123bad}} and {{has-dash}}.", regex), []);
});

test("agent config saves preserve and submit variable metadata", async () => {
  const configDefaults = await text("apps/console/src/lib/agents/config-defaults.ts");
  const behaviorTab = await text("apps/console/src/components/agents/tabs/BehaviorTab.tsx");
  const agentQueries = await text("apps/console/src/hooks/queries/agents.ts");

  assert.match(configDefaults, /variables:\s*\{\s*firstMessage:\s*\[\],\s*systemPrompt:\s*\[\],\s*placeholders:\s*\{\},\s*\}/s);
  assert.match(configDefaults, /variables:\s*normalizeAgentVariables\(current\.variables\)/);
  assert.match(behaviorTab, /buildAgentVariables\(\s*values\.firstMessage,\s*values\.systemPrompt,\s*placeholderValues\s*\)/s);
  assert.match(behaviorTab, /mergeConfig\(config,\s*\{\s*\.\.\.values,\s*variables\s*\}\)/);
  assert.match(agentQueries, /qc\.setQueryData\(queryKeys\.agents\.config\(id\),\s*\{[\s\S]*ivr_navigation_enabled:\s*input\.ivr_navigation_enabled/);
});

test("quick outbound calls submit and dispatch dynamic variable values", async () => {
  const quickCallForm = await text("apps/console/src/components/outbound/QuickCallForm.tsx");
  const quickCallModel = await text("apps/console/src/models/outbound/quickCall.ts");
  const outboundSchema = await text("apps/server/src/modules/outbound/outbound-call.schema.ts");
  const outboundService = await text("apps/server/src/modules/outbound/outbound-call.service.ts");

  assert.match(quickCallForm, /<DynamicVariableInputs[\s\S]*title="Call variables"/);
  assert.match(quickCallForm, /dynamicVariables:\s*dynamicVariablePayload\(/);
  assert.match(quickCallModel, /dynamicVariables:\s*z\.record\(z\.string\(\),\s*z\.string\(\)\)\.optional\(\)/);
  assert.match(outboundSchema, /dynamicVariables:\s*z\.record\(z\.string\(\),\s*z\.string\(\)\)\.optional\(\)/);
  assert.match(outboundService, /optionalData:[\s\S]*\.\.\.dynamicVariableData/);
  assert.match(outboundService, /dynamic_variables:\s*Object\.keys\(dynamicVariables\)\.length > 0 \? dynamicVariables : null/);
});

test("batch templates include selected agent dynamic variables", async () => {
  const batchForm = await text("apps/console/src/components/outbound/BatchCallForm.tsx");
  const campaignModel = await text("apps/console/src/models/outbound/campaign.ts");

  assert.match(campaignModel, /BATCH_TEMPLATE_BASE_COLUMNS = \[[\s\S]*"phone_number"[\s\S]*"prompt"[\s\S]*\] as const/);
  assert.match(campaignModel, /function buildBatchTemplateHeader\(variableNames: string\[] = \[]\)/);
  assert.match(batchForm, /buildBatchTemplateHeader\(dynamicVariableNames\)/);
  assert.match(batchForm, /buildBatchTemplateCsv\(dynamicVariableNames\)/);
  assert.match(batchForm, /navigator\.clipboard\.writeText\(templateHeader\)/);
  assert.match(batchForm, /<Download \/> Download CSV/);
  assert.match(batchForm, /Template variables/);
});

test("initiation webhook response variables are editable and saved", async () => {
  const webhooksTab = await text("apps/console/src/components/agents/tabs/WebhooksTab.tsx");
  const agentSchema = await text("apps/server/src/modules/agent/agent.schema.ts");

  assert.match(agentSchema, /dynamic_variables:\s*z\.record\(z\.string\(\),\s*z\.string\(\)\)\.optional\(\)/);
  assert.match(webhooksTab, /Response variables/);
  assert.match(webhooksTab, /webhookVariableNamePattern = \/\^\[A-Za-z_\]\[A-Za-z0-9_\]\*\$\//);
  assert.match(webhooksTab, /const dynamic_variables = recordFromRows\(initiationVariableRows\)/);
  assert.match(webhooksTab, /fetch dynamic variables\s+and caller context/);
  assert.match(webhooksTab, /JSON paths from the webhook response/);
  assert.match(
    webhooksTab,
    /Object\.keys\(dynamic_variables\)\.length > 0[\s\S]*\? \{ dynamic_variables \}[\s\S]*: \{\}/,
  );
});

test("AI runtime merges initiation webhook variables before rendering prompts", async () => {
  const workerHandler = await text("apps/ai/handlers/worker_handler.py");
  const aiMain = await text("apps/ai/main.py");

  assert.match(workerHandler, /async def apply_initiation_webhook_metadata/);
  assert.match(workerHandler, /webhook_mappings = webhook\.get\("dynamic_variables"\)/);
  assert.match(workerHandler, /mapped_dynamic_variables = resolve_webhook_dynamic_variables\([\s\S]*response,[\s\S]*webhook_mappings,[\s\S]*\)/);
  assert.match(workerHandler, /extract_webhook_dynamic_variables\(response\)[\s\S]*existing_dynamic_variables/);
  assert.match(workerHandler, /DYNAMIC_VARIABLE_TOKEN_RE = re\.compile/);
  assert.match(aiMain, /metadata = \{\*\*voice_metadata\.client_metadata, "mode": voice_metadata\.mode\}/);
  assert.match(aiMain, /metadata = await apply_initiation_webhook_metadata\(config, metadata, call_context\)/);
  assert.match(aiMain, /config = apply_metadata_overrides\(config, metadata\)/);
});


test("advanced runtime settings expose IVR navigation", async () => {
  const advancedTab = await text("apps/console/src/components/agents/tabs/AdvancedTab.tsx");
  const configDefaults = await text("apps/console/src/lib/agents/config-defaults.ts");
  const agentResource = await text("apps/console/src/lib/api/resources/agents.ts");
  const agentTypes = await text("apps/console/src/lib/api/types.ts");
  const agentSchema = await text("apps/server/src/modules/agent/agent.schema.ts");

  assert.match(advancedTab, /ivr_navigation_enabled/);
  assert.match(advancedTab, /IVR navigation/);
  assert.match(advancedTab, /DTMF tones/);
  assert.match(advancedTab, /form\.reset\(values\)/);
  assert.match(configDefaults, /ivr_navigation_enabled:\s*true/);
  assert.match(configDefaults, /ivr_navigation_enabled:\s*current\.ivr_navigation_enabled \?\? true/);
  assert.match(agentResource, /ivr_navigation_enabled:\s*boolean/);
  assert.match(agentTypes, /ivr_navigation_enabled:\s*boolean/);
  assert.match(agentSchema, /ivr_navigation_enabled:\s*z\.boolean\(\)\.default\(true\)/);
});
