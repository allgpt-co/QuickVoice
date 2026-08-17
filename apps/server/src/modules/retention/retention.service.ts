import { kbStatus } from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";
import { deleteObject } from "../../config/s3.js";
import { cleanupKnowledgeSourceAssets } from "../kb/kb-assets.service.js";

const DEFAULT_TRANSCRIPT_RETENTION_DAYS = 90;
const DEFAULT_RECORDING_RETENTION_DAYS = 30;
const DEFAULT_MCP_LOG_RETENTION_DAYS = 30;
const DEFAULT_FAILED_KB_RETENTION_DAYS = 30;
const DEFAULT_CLEANUP_BATCH_SIZE = 25;
const MAX_RETENTION_DAYS = 3_650;
const MAX_CLEANUP_BATCH_SIZE = 250;

type RetentionDependencies = {
  cleanupKnowledgeSourceAssetsImpl?: typeof cleanupKnowledgeSourceAssets;
  deleteRecordingObjectImpl?: typeof deleteObject;
};

type CleanupResult = {
  deleted: number;
  failures: number;
};

export async function runRetention(
  now = new Date(),
  dependencies: RetentionDependencies = {}
) {
  const recordingCutoff = daysAgo(
    now,
    readDays("RECORDING_RETENTION_DAYS", DEFAULT_RECORDING_RETENTION_DAYS)
  );
  const mcpLogCutoff = daysAgo(
    now,
    readDays("MCP_LOG_RETENTION_DAYS", DEFAULT_MCP_LOG_RETENTION_DAYS)
  );
  const failedKbCutoff = daysAgo(
    now,
    readDays("FAILED_KB_RETENTION_DAYS", DEFAULT_FAILED_KB_RETENTION_DAYS)
  );
  const batchSize = readBatchSize();

  const [transcriptsDeleted, recordings, mcpLogs, failedKnowledgeSources] =
    await Promise.all([
      deleteExpiredTranscripts(now),
      cleanupExpiredRecordings(
        recordingCutoff,
        batchSize,
        dependencies.deleteRecordingObjectImpl ?? deleteObject
      ),
      prisma.mcpToolExecutionLog.deleteMany({
        where: { createdAt: { lt: mcpLogCutoff } },
      }),
      cleanupFailedKnowledgeSources(
        failedKbCutoff,
        batchSize,
        dependencies.cleanupKnowledgeSourceAssetsImpl ??
          cleanupKnowledgeSourceAssets
      ),
    ]);

  return {
    transcriptsDeleted,
    recordingObjectsDeleted: recordings.deleted,
    recordingsDetached: recordings.detached,
    recordingCleanupFailures: recordings.failures,
    mcpLogsDeleted: mcpLogs.count,
    failedKnowledgeSourcesDeleted: failedKnowledgeSources.deleted,
    failedKnowledgeSourceCleanupFailures: failedKnowledgeSources.failures,
  };
}

async function deleteExpiredTranscripts(now: Date) {
  const [configurations, unconfiguredAgents] = await Promise.all([
    prisma.agentConfiguration.findMany({
      select: {
        agentId: true,
        conversation_retention_days: true,
      },
    }),
    prisma.agent.findMany({
      where: { configuration: null },
      select: { agentId: true },
    }),
  ]);

  const agentIdsByRetentionDays = new Map<number, string[]>();
  for (const configuration of configurations) {
    const days = normalizeDays(
      configuration.conversation_retention_days,
      DEFAULT_TRANSCRIPT_RETENTION_DAYS
    );
    const agentIds = agentIdsByRetentionDays.get(days) ?? [];
    agentIds.push(configuration.agentId);
    agentIdsByRetentionDays.set(days, agentIds);
  }

  const defaultAgentIds = unconfiguredAgents.map((agent) => agent.agentId);
  if (defaultAgentIds.length > 0) {
    const existing =
      agentIdsByRetentionDays.get(DEFAULT_TRANSCRIPT_RETENTION_DAYS) ?? [];
    agentIdsByRetentionDays.set(DEFAULT_TRANSCRIPT_RETENTION_DAYS, [
      ...existing,
      ...defaultAgentIds,
    ]);
  }

  const deletionResults = await Promise.all([
    ...Array.from(agentIdsByRetentionDays, ([days, agentIds]) =>
      prisma.callTranscript.deleteMany({
        where: {
          callLog: {
            agentId: { in: agentIds },
            endTime: { lt: daysAgo(now, days) },
          },
        },
      })
    ),
    prisma.callTranscript.deleteMany({
      where: {
        callLog: {
          agentId: null,
          endTime: {
            lt: daysAgo(
              now,
              readDays(
                "TRANSCRIPT_RETENTION_DAYS",
                DEFAULT_TRANSCRIPT_RETENTION_DAYS
              )
            ),
          },
        },
      },
    }),
  ]);

  return deletionResults.reduce((total, result) => total + result.count, 0);
}

async function cleanupExpiredRecordings(
  cutoff: Date,
  batchSize: number,
  deleteRecordingObject: typeof deleteObject
): Promise<CleanupResult & { detached: number }> {
  let cursor: string | undefined;
  let deleted = 0;
  let detached = 0;
  let failures = 0;

  while (true) {
    const rows = await prisma.callLog.findMany({
      where: {
        endTime: { lt: cutoff },
        audioRecordingPath: { not: null },
        ...(cursor ? { callId: { gt: cursor } } : {}),
      },
      orderBy: { callId: "asc" },
      take: batchSize,
      select: {
        callId: true,
        audioRecordingPath: true,
      },
    });
    if (rows.length === 0) break;

    const results = await Promise.all(
      rows.map(async (row) => {
        const path = row.audioRecordingPath;
        if (!path) return { deleted: 0, detached: 0, failed: 0 };

        try {
          const storedInS3 = !isHttpUrl(path);
          if (storedInS3) {
            await deleteRecordingObject(path);
          }
          const update = await prisma.callLog.updateMany({
            where: {
              callId: row.callId,
              audioRecordingPath: path,
            },
            data: { audioRecordingPath: null },
          });
          return {
            deleted: storedInS3 ? 1 : 0,
            detached: update.count,
            failed: 0,
          };
        } catch {
          console.warn("[retention] recording cleanup failed", {
            callId: row.callId,
          });
          return { deleted: 0, detached: 0, failed: 1 };
        }
      })
    );

    for (const result of results) {
      deleted += result.deleted;
      detached += result.detached;
      failures += result.failed;
    }

    cursor = rows.at(-1)!.callId;
    if (rows.length < batchSize) break;
  }

  return { deleted, detached, failures };
}

async function cleanupFailedKnowledgeSources(
  cutoff: Date,
  batchSize: number,
  cleanupAssets: typeof cleanupKnowledgeSourceAssets
): Promise<CleanupResult> {
  let cursor: string | undefined;
  let deleted = 0;
  let failures = 0;

  while (true) {
    const rows = await prisma.knowledgeSource.findMany({
      where: {
        status: kbStatus.ERROR,
        uploadedAt: { lt: cutoff },
        ...(cursor ? { kbId: { gt: cursor } } : {}),
      },
      orderBy: { kbId: "asc" },
      take: batchSize,
    });
    if (rows.length === 0) break;

    const results = await Promise.all(
      rows.map(async (source) => {
        try {
          await cleanupAssets(source);
          const result = await prisma.knowledgeSource.deleteMany({
            where: {
              kbId: source.kbId,
              status: kbStatus.ERROR,
              uploadedAt: { lt: cutoff },
            },
          });
          return { deleted: result.count, failed: 0 };
        } catch {
          console.warn("[retention] knowledge-source cleanup failed", {
            kbId: source.kbId,
          });
          return { deleted: 0, failed: 1 };
        }
      })
    );

    for (const result of results) {
      deleted += result.deleted;
      failures += result.failed;
    }

    cursor = rows.at(-1)!.kbId;
    if (rows.length < batchSize) break;
  }

  return { deleted, failures };
}

function readDays(name: string, fallback: number) {
  return normalizeDays(Number(process.env[name]), fallback);
}

function normalizeDays(value: number, fallback: number) {
  return Number.isInteger(value) && value > 0 && value <= MAX_RETENTION_DAYS
    ? value
    : fallback;
}

function readBatchSize() {
  const value = Number(process.env.RETENTION_CLEANUP_BATCH_SIZE);
  return Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_CLEANUP_BATCH_SIZE
    ? value
    : DEFAULT_CLEANUP_BATCH_SIZE;
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}
