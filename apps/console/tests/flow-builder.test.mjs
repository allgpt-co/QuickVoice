import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

assert.match(read("src/components/flows/FlowBuilder.tsx"), /ReactFlow/);
assert.match(read("src/components/flows/TestFlowDialog.tsx"), /useRunFlowTest/);
assert.match(read("src/components/agents/AgentTabs.tsx"), /FlowTab/);
