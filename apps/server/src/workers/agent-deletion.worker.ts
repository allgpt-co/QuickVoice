import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { closeRedisClient } from "./shutdown.js";

import { deleteAgent } from "../modules/agent/agent.service.js";
import * as agentRepository from "../modules/agent/agent.repository.js";
import type {
  AgentDeletionJobData,
  AgentDeletionJobName,
} from "../queues/agent-deletion.queue.js";

let redisConnection: Redis | undefined;

export async function processAgentDeletionJob(job: {
  data: AgentDeletionJobData;
}) {
  const { organizationId, agentId } = job.data;
  const claimed = await agentRepository.markAgentDeletionAttempt(
    organizationId,
    agentId,
  );
  // A missing row means a prior attempt already completed.
  if (claimed.count === 0) return;

  try {
    await deleteAgent(organizationId, agentId);
  } catch (error) {
    await agentRepository.markAgentDeletionFailed(
      organizationId,
      agentId,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

export const agentDeletionWorker = new Worker<
  AgentDeletionJobData,
  void,
  AgentDeletionJobName
>("agent-deletion", processAgentDeletionJob, {
  connection: getRedisConnection(),
  concurrency: 2,
});

agentDeletionWorker.on("failed", (job, error) => {
  console.error("[agent-deletion-worker] job failed", {
    jobId: job?.id,
    agentId: job?.data.agentId,
    attempt: job?.attemptsMade,
    error: error.message,
  });
});

agentDeletionWorker.on("error", (error) => {
  console.error("[agent-deletion-worker] worker error", error);
});

export async function closeAgentDeletionWorker() {
  try {
    await agentDeletionWorker.close();
  } finally {
    if (redisConnection) {
      await closeRedisClient(redisConnection);
      redisConnection = undefined;
    }
  }
}

function getRedisConnection() {
  redisConnection ??= new Redis(
    process.env.REDIS_URL ?? "redis://localhost:6379",
    { maxRetriesPerRequest: null },
  );
  return redisConnection;
}
