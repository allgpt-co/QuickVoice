import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { closeRedisClient } from "../workers/shutdown.js";

export type AgentDeletionJobName = "delete";

export interface AgentDeletionJobData {
  agentId: string;
  organizationId: string;
}

let agentDeletionQueue:
  | Queue<AgentDeletionJobData, void, AgentDeletionJobName>
  | undefined;
let agentDeletionRedisConnection: Redis | undefined;

export function getAgentDeletionQueue() {
  agentDeletionQueue ??= new Queue<
    AgentDeletionJobData,
    void,
    AgentDeletionJobName
  >("agent-deletion", {
    connection: getAgentDeletionRedisConnection(),
    defaultJobOptions: {
      attempts: 10,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: true,
      // Recovery re-enqueues permanently failed operations by deterministic id.
      removeOnFail: true,
    },
  });
  return agentDeletionQueue;
}

export function agentDeletionJobId(agentId: string) {
  return `agent-delete-${agentId}`;
}

export async function enqueueAgentDeletion(data: AgentDeletionJobData) {
  await getAgentDeletionQueue().add("delete", data, {
    jobId: agentDeletionJobId(data.agentId),
  });
}

export async function closeAgentDeletionQueue() {
  try {
    await agentDeletionQueue?.close();
  } finally {
    agentDeletionQueue = undefined;
    if (agentDeletionRedisConnection) {
      await closeRedisClient(agentDeletionRedisConnection);
      agentDeletionRedisConnection = undefined;
    }
  }
}

function getAgentDeletionRedisConnection() {
  agentDeletionRedisConnection ??= new Redis(
    process.env.REDIS_URL ?? "redis://localhost:6379",
    { maxRetriesPerRequest: null },
  );
  return agentDeletionRedisConnection;
}
