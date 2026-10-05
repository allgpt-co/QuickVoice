import type { Redis } from "ioredis";

type CloseResource = () => void | Promise<unknown>;

export async function closeResourcesInPhases(phases: CloseResource[][]) {
  const failures: unknown[] = [];
  for (const phase of phases) {
    const results = await Promise.allSettled(
      phase.map((closeResource) => Promise.resolve().then(closeResource)),
    );
    failures.push(
      ...results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      ),
    );
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "One or more resources failed to close");
  }
}

// QUIT must not wait forever in ioredis's offline queue during an outage.
export async function closeRedisClient(
  client: Pick<Redis, "status" | "quit" | "disconnect">,
  timeoutMs = 1_000,
) {
  if (client.status === "end") return;
  if (client.status !== "ready") {
    client.disconnect();
    return;
  }
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      client.quit(),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } catch {
    // A failed QUIT still requires disconnecting the socket and reconnect loop.
  } finally {
    clearTimeout(timer);
    client.disconnect();
  }
}

export function armShutdownDeadline(timeoutMs = 30_000) {
  // Leave armed even after cleanup: leftover sockets must not keep us alive.
  // Unref lets a fully drained process exit normally before the deadline.
  return setTimeout(() => {
    console.error("[server] shutdown deadline exceeded; forcing exit");
    process.exit(1);
  }, timeoutMs).unref();
}
