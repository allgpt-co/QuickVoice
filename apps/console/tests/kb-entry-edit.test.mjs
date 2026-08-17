import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

test("knowledge base rows expose a view and edit action", () => {
  const table = read("src/components/kb/KbTable.tsx");

  assert.match(table, /View \/ edit/);
  assert.match(table, /EditKbDialog/);
  assert.match(table, /setEditingKbId/);
});

test("knowledge source dialog shows stored details and supported edit fields", () => {
  const dialog = read("src/components/kb/EditKbDialog.tsx");

  assert.match(dialog, /Knowledge source details/);
  assert.match(dialog, /Display name/);
  assert.match(dialog, /Assigned agent/);
  assert.match(dialog, /Source URL/);
  assert.match(dialog, /Stored details/);
  assert.match(dialog, /Metadata/);
  assert.match(dialog, /queued for reprocessing|queues[\s\S]*reprocessing/i);
  assert.match(dialog, /Wait for processing to finish/);
});

test("saving a knowledge source uses PATCH and refreshes KB and agent caches", () => {
  const resource = read("src/lib/api/resources/kb.ts");
  const hooks = read("src/hooks/queries/kb.ts");

  assert.match(resource, /apiClient\.patch/);
  assert.match(resource, /`\/kb\/\$\{kbId\}`/);
  assert.match(hooks, /useUpdateKb/);
  assert.match(hooks, /queryKeys\.kb\.all/);
  assert.match(hooks, /queryKeys\.agents\.all/);
});
