import * as agentRepository from "./agent.repository.js";
import { enqueueAgentDeletion } from "../../queues/agent-deletion.queue.js";

const DEFAULT_RECOVERY_INTERVAL_MS = 60_000;
let recoveryTimer: NodeJS.Timeout | undefined;
let recoveryRunning = false;

export async function recoverPendingAgentDeletions(
  dependencies: {
    listPendingImpl?: typeof agentRepository.listPendingAgentDeletions;
    enqueueImpl?: typeof enqueueAgentDeletion;
  } = {},
) {
  const pending = await (
    dependencies.listPendingImpl ?? agentRepository.listPendingAgentDeletions
  )();
  const enqueue = dependencies.enqueueImpl ?? enqueueAgentDeletion;
  const results = await Promise.allSettled(pending.map(enqueue));
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length > 0) {
    console.error("[agent-deletion] recovery enqueue failed", {
      failed: failed.length,
      pending: pending.length,
    });
  }
  return { pending: pending.length, failed: failed.length };
}

export function startAgentDeletionRecovery() {
  if (recoveryTimer) return;
  void runRecovery();
  recoveryTimer = setInterval(
    () => void runRecovery(),
    positiveInterval(process.env.AGENT_DELETION_RECOVERY_INTERVAL_MS),
  );
  recoveryTimer.unref();
}

export function stopAgentDeletionRecovery() {
  if (recoveryTimer) clearInterval(recoveryTimer);
  recoveryTimer = undefined;
}

async function runRecovery() {
  if (recoveryRunning) return;
  recoveryRunning = true;
  try {
    await recoverPendingAgentDeletions();
  } catch (error) {
    console.error("[agent-deletion] recovery scan failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    recoveryRunning = false;
  }
}

function positiveInterval(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_RECOVERY_INTERVAL_MS;
}
