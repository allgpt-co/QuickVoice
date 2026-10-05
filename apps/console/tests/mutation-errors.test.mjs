import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { MutationObserver, QueryClient } from "@tanstack/react-query";

// Execute the real event-handler bodies without mounting unrelated UI or calling live APIs.
function loadHandler(file, name, scope) {
  const source = ts.createSourceFile(
    file,
    readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let handler;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name)
      handler = node;
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name)
      handler = node.initializer;
    if (
      name === "inlineDelete" &&
      ts.isArrowFunction(node) &&
      node.body.getText(source).includes("await del.mutateAsync(source.kbId)")
    )
      handler = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(handler, `${file}: ${name} exists`);
  const js = ts.transpileModule(
    `const callback = ${handler.getText(source)}; callback;`,
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  return vm.runInNewContext(js, { ...scope });
}

const cases = [
  ["components/calls/CallsTable.tsx", "confirmDelete"],
  ["components/agents/AgentsTable.tsx", "confirmDelete"],
  ["components/secrets/SecretsTable.tsx", "confirmDelete"],
  ["components/tools/ToolCard.tsx", "handleDelete"],
  ["components/tools/ToolSheet.tsx", "onSubmit", { mode: "create" }],
  ["components/tools/ToolSheet.tsx", "onSubmit", { mode: "edit" }],
  ["components/outbound/OutboundCallsPanel.tsx", "confirmCancel"],
  ["components/outbound/CampaignsPanel.tsx", "confirmCancel"],
  ["components/agents/NewAgentDialog.tsx", "onSubmit"],
  ["components/kb/DeleteKbButton.tsx", "onDelete"],
  ["components/kb/KbTable.tsx", "inlineDelete"],
  ["components/agents/tabs/AdvancedTab.tsx", "onSubmit"],
  ["components/agents/tabs/AdvancedTab.tsx", "pauseAgent"],
  ["components/agents/tabs/AdvancedTab.tsx", "resumeAgent"],
  ["components/agents/tabs/AdvancedTab.tsx", "confirmDelete"],
  [
    "components/agents/tabs/WebsiteWidgetTab.tsx",
    "saveWidget",
    { widget: null },
  ],
  [
    "components/agents/tabs/WebsiteWidgetTab.tsx",
    "saveWidget",
    { widget: { widgetId: "widget" } },
  ],
  ["components/agents/tabs/WebsiteWidgetTab.tsx", "removeWidget"],
  ["components/agents/tabs/VoiceTab.tsx", "onSubmit"],
  ["components/agents/tabs/WebhooksTab.tsx", "onSubmit"],
  ["components/agents/tabs/AnalysisTab.tsx", "saveAnalysis"],
  ["app/(app)/calls/[id]/page.tsx", "onDelete"],
  ["app/(app)/agents/[id]/page.tsx", "confirmDelete"],
  ["components/agents/tabs/BehaviorTab.tsx", "onSubmit"],
  ["components/agents/tabs/BehaviorTab.tsx", "onDialogConfirm"],
  ["components/numbers/BuyNumberDrawer.tsx", "onBuy"],
];

for (const [file, name, overrides] of cases) {
  test(`${file}: ${name} ${JSON.stringify(overrides ?? {})} handles rejection and permits retry`, async () => {
    const effects = [];
    const errors = [];
    const buying = [];
    let failing = true;
    let requests = 0;
    const observer = new MutationObserver(new QueryClient(), {
      gcTime: 0,
      retry: false,
      mutationFn: async () => {
        requests++;
        if (failing) throw new Error("API request failed");
        return { name: "Agent", agentId: "agent" };
      },
      onError: (error) => errors.push(error.message),
    });
    const unsubscribe = observer.subscribe(() => {});
    const mutation = { mutateAsync: observer.mutate.bind(observer) };
    const effect = () => effects.push("success");
    const values = {
      name: "Draft",
      response_timeout_secs: "",
      api_headers: [],
      dynamic_variables: [],
      api_query_params: [],
      api_path_params: [],
      api_body: [],
      phoneNumber: "+15551234567",
    };
    const scope = {
      ...Object.fromEntries(
        [
          "del",
          "deleteAgent",
          "deleteSecret",
          "deleteTool",
          "cancelCall",
          "cancelCampaign",
          "createAgent",
          "createTool",
          "updateTool",
          "save",
          "update",
          "updateWidget",
          "createWidget",
          "deleteWidget",
          "buy",
        ].map((key) => [key, mutation]),
      ),
      ...Object.fromEntries(
        [
          "setDeleteTarget",
          "setCancelTarget",
          "setOpen",
          "onOpenChange",
          "setSelectedTemplate",
          "setConfirming",
          "setDeleteOpen",
          "onCreated",
          "onDeleted",
          "setDialogOpen",
          "setPlaceholderValues",
          "setInitiationVariableRows",
          "setInitiationHeaderRows",
          "setInitiationBodyRows",
          "setPostHeaderRows",
          "setSearchParams",
        ].map((key) => [key, effect]),
      ),
      deleteTarget: { callId: "call", agentId: "agent", secretId: "secret" },
      cancelTarget: { outboundId: "outbound", campaignId: "campaign" },
      tool: { toolId: "tool" },
      source: { kbId: "kb" },
      kbId: "kb",
      agentId: "agent",
      params: { id: "id" },
      widget: { widgetId: "widget", name: "Widget" },
      selectedTemplate: "blank",
      dialogIntent: "save",
      config: {},
      dataNeeded: [],
      evaluations: [],
      placeholderValues: {},
      initiationVariableRows: [],
      initiationHeaderRows: [],
      initiationBodyRows: [],
      postHeaderRows: [],
      detectedVariableNames: [],
      recordFromRows: () => ({}),
      secretFieldsFromRows: () => ({}),
      rowsForVariables: () => [],
      rowsForSecretFields: () => [],
      cleanKvPairs: (value) => value,
      mergeConfig: (_config, value) => value,
      formToPayload: () => ({}),
      buildAgentVariables: () => ({ placeholders: {} }),
      missingDynamicVariableNames: () => [],
      form: { reset: effect, getValues: () => values },
      router: { push: effect },
      toast: { success: effect },
      window: { confirm: () => true },
      searchParams: { provider: "TWILIO" },
      buyingNumber: null,
      isQuoteExpired: () => false,
      setBuyingNumber: (value) => buying.push(value),
      ...overrides,
    };
    if (file.endsWith("BehaviorTab.tsx"))
      scope.saveValues = loadHandler(file, "saveValues", scope);
    const callback = loadHandler(file, name, scope);
    try {
      await assert.doesNotReject(() => callback(values));
      assert.equal(requests, 1, "test reaches the mutation");
      assert.deepEqual(
        errors,
        ["API request failed"],
        "onError still reports the failure once",
      );
      assert.deepEqual(
        effects,
        [],
        "failure must not reset, close, navigate, or announce success",
      );
      if (name === "onBuy")
        assert.deepEqual(
          buying,
          [values.phoneNumber, null],
          "finally clears buying state",
        );

      failing = false;
      await callback(values);
      assert.equal(requests, 2, "the handler remains usable after failure");
      if (
        !file.endsWith("VoiceTab.tsx") &&
        !file.endsWith("AnalysisTab.tsx") &&
        !(name === "saveWidget" && overrides?.widget)
      ) {
        assert.ok(
          effects.length > 0,
          "success-only actions still run after successful retry",
        );
      }
    } finally {
      unsubscribe();
    }
  });
}


test("number purchase ignores another submission while buying a number", async () => {
  let requests = 0;
  const callback = loadHandler("components/numbers/BuyNumberDrawer.tsx", "onBuy", {
    searchParams: { provider: "TWILIO" },
    buyingNumber: "+15551234567",
    isQuoteExpired: () => false,
    setBuyingNumber: () => {},
    buy: { mutateAsync: async () => { requests++; } },
    setOpen: () => {},
    form: { reset: () => {} },
    setSearchParams: () => {},
  });
  await callback({ phoneNumber: "+15557654321", quoteId: "signed-quote" });
  assert.equal(requests, 0, "must not start a second purchase");
});
