import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "../../src/config/prisma.js";
import { runRetention } from "../../src/modules/retention/retention.service.js";

const originalAgentConfigurationFindMany =
  prisma.agentConfiguration.findMany.bind(prisma.agentConfiguration);
const originalAgentFindMany = prisma.agent.findMany.bind(prisma.agent);
const originalCallTranscriptDeleteMany =
  prisma.callTranscript.deleteMany.bind(prisma.callTranscript);
const originalCallLogFindMany = prisma.callLog.findMany.bind(prisma.callLog);
const originalCallLogUpdateMany =
  prisma.callLog.updateMany.bind(prisma.callLog);
const originalMcpLogDeleteMany =
  prisma.mcpToolExecutionLog.deleteMany.bind(prisma.mcpToolExecutionLog);
const originalKnowledgeSourceFindMany =
  prisma.knowledgeSource.findMany.bind(prisma.knowledgeSource);
const originalKnowledgeSourceDeleteMany =
  prisma.knowledgeSource.deleteMany.bind(prisma.knowledgeSource);

afterEach(() => {
  prisma.agentConfiguration.findMany = originalAgentConfigurationFindMany;
  prisma.agent.findMany = originalAgentFindMany;
  prisma.callTranscript.deleteMany = originalCallTranscriptDeleteMany;
  prisma.callLog.findMany = originalCallLogFindMany;
  prisma.callLog.updateMany = originalCallLogUpdateMany;
  prisma.mcpToolExecutionLog.deleteMany = originalMcpLogDeleteMany;
  prisma.knowledgeSource.findMany = originalKnowledgeSourceFindMany;
  prisma.knowledgeSource.deleteMany = originalKnowledgeSourceDeleteMany;
});

test("retention applies per-agent transcript policies and removes external assets first", async () => {
  const transcriptDeletes: Array<Record<string, unknown>> = [];
  const detachedPaths: string[] = [];
  const recordingDeletes: string[] = [];
  const kbCleanups: string[] = [];

  prisma.agentConfiguration.findMany = (async () => [
    { agentId: "agent-short", conversation_retention_days: 7 },
    { agentId: "agent-long", conversation_retention_days: 30 },
  ]) as typeof prisma.agentConfiguration.findMany;
  prisma.agent.findMany = (async () => [
    { agentId: "agent-unconfigured" },
  ]) as typeof prisma.agent.findMany;
  prisma.callTranscript.deleteMany = (async (args: {
    where: Record<string, unknown>;
  }) => {
    transcriptDeletes.push(args.where);
    return { count: 2 };
  }) as typeof prisma.callTranscript.deleteMany;
  prisma.callLog.findMany = (async () => [
    {
      callId: "call-1",
      audioRecordingPath: "Voice-agents/Recordings/call-1.ogg",
    },
    {
      callId: "call-2",
      audioRecordingPath: "https://recordings.example/call-2.ogg",
    },
  ]) as typeof prisma.callLog.findMany;
  prisma.callLog.updateMany = (async (args: {
    where: { audioRecordingPath: string };
  }) => {
    detachedPaths.push(args.where.audioRecordingPath);
    return { count: 1 };
  }) as typeof prisma.callLog.updateMany;
  prisma.mcpToolExecutionLog.deleteMany = (async () => ({
    count: 4,
  })) as typeof prisma.mcpToolExecutionLog.deleteMany;
  prisma.knowledgeSource.findMany = (async () => [
    {
      kbId: "kb-1",
      agentId: "agent-short",
      storagePath: "knowledge/kb-1.pdf",
      sourceType: "PDF",
    },
  ]) as typeof prisma.knowledgeSource.findMany;
  prisma.knowledgeSource.deleteMany = (async () => ({
    count: 1,
  })) as typeof prisma.knowledgeSource.deleteMany;

  const result = await runRetention(new Date("2026-07-26T00:00:00.000Z"), {
    deleteRecordingObjectImpl: async (path) => {
      recordingDeletes.push(path);
    },
    cleanupKnowledgeSourceAssetsImpl: async (source) => {
      kbCleanups.push(source.kbId);
    },
  });

  assert.equal(transcriptDeletes.length, 4);
  assert.deepEqual(
    transcriptDeletes.map((where) => where.callLog),
    [
      {
        agentId: { in: ["agent-short"] },
        endTime: { lt: new Date("2026-07-19T00:00:00.000Z") },
      },
      {
        agentId: { in: ["agent-long"] },
        endTime: { lt: new Date("2026-06-26T00:00:00.000Z") },
      },
      {
        agentId: { in: ["agent-unconfigured"] },
        endTime: { lt: new Date("2026-04-27T00:00:00.000Z") },
      },
      {
        agentId: null,
        endTime: { lt: new Date("2026-04-27T00:00:00.000Z") },
      },
    ]
  );
  assert.deepEqual(recordingDeletes, [
    "Voice-agents/Recordings/call-1.ogg",
  ]);
  assert.deepEqual(detachedPaths.sort(), [
    "Voice-agents/Recordings/call-1.ogg",
    "https://recordings.example/call-2.ogg",
  ].sort());
  assert.deepEqual(kbCleanups, ["kb-1"]);
  assert.deepEqual(result, {
    transcriptsDeleted: 8,
    recordingObjectsDeleted: 1,
    recordingsDetached: 2,
    recordingCleanupFailures: 0,
    mcpLogsDeleted: 4,
    failedKnowledgeSourcesDeleted: 1,
    failedKnowledgeSourceCleanupFailures: 0,
  });
});

test("retention preserves rows when external cleanup fails so a later run can retry", async () => {
  let recordingUpdates = 0;
  let knowledgeSourceDeletes = 0;

  prisma.agentConfiguration.findMany = (async () => []) as typeof prisma.agentConfiguration.findMany;
  prisma.agent.findMany = (async () => []) as typeof prisma.agent.findMany;
  prisma.callTranscript.deleteMany = (async () => ({
    count: 0,
  })) as typeof prisma.callTranscript.deleteMany;
  prisma.callLog.findMany = (async () => [
    {
      callId: "call-failed",
      audioRecordingPath: "Voice-agents/Recordings/call-failed.ogg",
    },
  ]) as typeof prisma.callLog.findMany;
  prisma.callLog.updateMany = (async () => {
    recordingUpdates += 1;
    return { count: 1 };
  }) as typeof prisma.callLog.updateMany;
  prisma.mcpToolExecutionLog.deleteMany = (async () => ({
    count: 0,
  })) as typeof prisma.mcpToolExecutionLog.deleteMany;
  prisma.knowledgeSource.findMany = (async () => [
    {
      kbId: "kb-failed",
      agentId: "agent-1",
      storagePath: "knowledge/kb-failed.pdf",
      sourceType: "PDF",
    },
  ]) as typeof prisma.knowledgeSource.findMany;
  prisma.knowledgeSource.deleteMany = (async () => {
    knowledgeSourceDeletes += 1;
    return { count: 1 };
  }) as typeof prisma.knowledgeSource.deleteMany;

  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const result = await runRetention(
      new Date("2026-07-26T00:00:00.000Z"),
      {
        deleteRecordingObjectImpl: async () => {
          throw new Error("storage unavailable");
        },
        cleanupKnowledgeSourceAssetsImpl: async () => {
          throw new Error("vector store unavailable");
        },
      }
    );

    assert.equal(recordingUpdates, 0);
    assert.equal(knowledgeSourceDeletes, 0);
    assert.equal(result.recordingCleanupFailures, 1);
    assert.equal(result.failedKnowledgeSourceCleanupFailures, 1);
  } finally {
    console.warn = originalWarn;
  }
});
