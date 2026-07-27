import assert from "node:assert/strict";
import { test } from "node:test";

import { deleteCallLog } from "../../src/modules/calllogs/calllog.service.js";

test("call deletion removes an S3 recording before erasing retained call data", async () => {
  const operations: string[] = [];

  await deleteCallLog("org_123", "call_123", {
    getCallForDeletionImpl: async () => ({
      callId: "call_123",
      audioRecordingPath: "Voice-agents/Recordings/call.ogg",
    }),
    deleteObjectImpl: async (key) => {
      operations.push(`object:${key}`);
    },
    deleteCallLogImpl: async (_callId, _organizationId, path) => {
      operations.push(`row:${path}`);
      return true;
    },
  });

  assert.deepEqual(operations, [
    "object:Voice-agents/Recordings/call.ogg",
    "row:Voice-agents/Recordings/call.ogg",
  ]);
});

test("call deletion preserves the row when recording cleanup fails", async () => {
  let rowDeleted = false;

  await assert.rejects(
    deleteCallLog("org_123", "call_123", {
      getCallForDeletionImpl: async () => ({
        callId: "call_123",
        audioRecordingPath: "Voice-agents/Recordings/call.ogg",
      }),
      deleteObjectImpl: async () => {
        throw new Error("storage unavailable");
      },
      deleteCallLogImpl: async () => {
        rowDeleted = true;
        return true;
      },
    }),
    /storage unavailable/
  );

  assert.equal(rowDeleted, false);
});

test("call deletion only detaches externally hosted recording URLs", async () => {
  let objectDeletes = 0;
  let expectedPath: string | null = null;

  await deleteCallLog("org_123", "call_123", {
    getCallForDeletionImpl: async () => ({
      callId: "call_123",
      audioRecordingPath: "https://recordings.example/call.ogg",
    }),
    deleteObjectImpl: async () => {
      objectDeletes += 1;
    },
    deleteCallLogImpl: async (_callId, _organizationId, path) => {
      expectedPath = path;
      return true;
    },
  });

  assert.equal(objectDeletes, 0);
  assert.equal(expectedPath, "https://recordings.example/call.ogg");
});
