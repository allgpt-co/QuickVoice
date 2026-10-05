import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

for (const scenario of ['stale', 'same-agent-edit', 'superseded', 'reassigned']) {
  test(`KB worker never deletes another generation: ${scenario}`, async () => {
    let run: any;
    const deleted: string[] = [];
    class Worker { constructor(_name: string, fn: any) { run = fn; } on() {} }
    const source = readFileSync(new URL('../../src/workers/kb.worker.ts', import.meta.url), 'utf8');
    runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports: {}, console, process: { env: { INTERNAL_API_KEY: 'isolated-test' } },
      require: (name: string) => {
        if (name === 'bullmq') return { Worker };
        if (name.endsWith('kb.repository.js')) return { markProcessing: async () => scenario === 'stale' ? [] : ['kb'], markActive: async () => scenario === 'superseded' ? [] : ['kb'] };
        if (name.endsWith('kb-processing-client.js')) return { processKbDocuments: async () => ({}), deleteKbDocumentVectors: async ({ agentId, permanent }: any) => { assert.equal(permanent, false); deleted.push(agentId); } };
        if (name.endsWith('kb-processing-result.js')) return { assertKbProcessingSucceeded: () => {} };
        return {};
      },
    });
    await run({ id: 'job', attemptsMade: 1, data: { kbIds: ['kb'], agentId: 'current', organizationId: 'org', documents: [{ kbId: 'kb' }], replaceExisting: true, previousAgentId: scenario === 'reassigned' ? 'previous' : 'current' } });
    assert.deepEqual(deleted, scenario === 'reassigned' ? ['previous'] : []);
  });
}
