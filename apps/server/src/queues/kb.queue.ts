import { Queue } from "bullmq";
import { Redis } from "ioredis";

export type KbJobName = "process";

export interface KbJobDocument {
  kbId: string;
  name: string;
  sourceType: string;
  url?: string | null;
  s3Key?: string | null;
  originalFileName?: string | null;
}

export interface KbJobData {
  kbIds: string[];
  agentId: string;
  organizationId: string;
  documents: KbJobDocument[];
  replaceExisting?: boolean;
  previousAgentId?: string | null;
}

let kbQueue: Queue<KbJobData, void, KbJobName> | undefined;
let kbRedisConnection: Redis | undefined;

export function getKbQueue() {
  kbQueue ??= new Queue<KbJobData, void, KbJobName>("kb-ingest", {
    connection: getKbRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
  return kbQueue;
}

function getKbRedisConnection() {
  kbRedisConnection ??= new Redis(
    process.env.REDIS_URL ?? "redis://localhost:6379",
    { maxRetriesPerRequest: null },
  );
  return kbRedisConnection;
}
