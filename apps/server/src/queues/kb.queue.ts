import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

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

export const kbQueue = new Queue<KbJobData, void, KbJobName>("kb-ingest", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});
