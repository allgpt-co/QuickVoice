import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import ts from "typescript";

function load(path, imports = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const testModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: testModule,
    exports: testModule.exports,
    require: (name) => {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return testModule.exports;
}

const { queryKeys } = load("../src/lib/query-keys.ts");

for (const action of ["save configuration", "delete document"]) {
  test(`${action} refreshes active agent details and invalidates inactive lists`, async (t) => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    t.after(() => client.clear());
    let agent = { agentId: "agent-1", isConfigured: false, knowledgeSourcesCount: 1 };
    let sources = [{ kbId: "kb-1", status: "ACTIVE" }];
    const imports = {
      "@tanstack/react-query": {
        useQueryClient: () => client,
        useQuery: (options) => options,
        useMutation: (options) => options,
      },
      sonner: { toast: { success() {}, error() {} } },
      "@/src/lib/query-keys": { queryKeys },
      "@/src/lib/api/resources/agents": {
        agentsApi: {
          list: async () => [{ ...agent }],
          saveConfig: async () => {
            agent = { ...agent, isConfigured: true };
            return { prompt: "Saved prompt" };
          },
        },
      },
      "@/src/lib/api/resources/kb": {
        kbApi: {
          list: async () => [...sources],
          remove: async () => {
            sources = [];
            agent = { ...agent, knowledgeSourcesCount: 0 };
          },
        },
      },
    };
    const agents = load("../src/hooks/queries/agents.ts", imports);
    const kb = load("../src/hooks/queries/kb.ts", imports);
    await client.fetchQuery(agents.useAgents());
    const detailOptions = agents.useAgent(agent.agentId);
    await client.fetchQuery(detailOptions);
    const detail = new QueryObserver(client, detailOptions);
    t.after(detail.subscribe(() => {}));
    const kbOptions = kb.useKbSources(agent.agentId);
    await client.fetchQuery(kbOptions);
    const kbObserver = new QueryObserver(client, kbOptions);
    t.after(kbObserver.subscribe(() => {}));

    const mutation = new MutationObserver(client, action === "save configuration"
      ? agents.useSaveAgentConfig(agent.agentId)
      : kb.useDeleteKb());
    await mutation.mutate(action === "save configuration"
      ? { ivr_navigation_enabled: false }
      : "kb-1");
    // Allow the invalidation-triggered requests to settle without manually refetching.
    await new Promise((resolve) => setImmediate(resolve));

    const current = detail.getCurrentResult().data;
    assert.equal(current.isConfigured, agent.isConfigured);
    assert.equal(current.knowledgeSourcesCount, agent.knowledgeSourcesCount);
    assert.equal(client.getQueryState(queryKeys.agents.list()).isInvalidated, true);
    if (action === "save configuration") {
      const config = client.getQueryData(queryKeys.agents.config(agent.agentId));
      assert.equal(config.prompt, "Saved prompt");
      assert.equal(config.ivr_navigation_enabled, false);
    } else {
      assert.equal(kbObserver.getCurrentResult().data.length, 0);
    }
    // Returning to the list must fetch its updated configuration/count too.
    const list = await client.fetchQuery(agents.useAgents());
    assert.equal(list[0].isConfigured, agent.isConfigured);
    assert.equal(list[0].knowledgeSourcesCount, agent.knowledgeSourcesCount);
  });
}
