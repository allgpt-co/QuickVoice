import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { redisConnection } from "../../src/config/redis.js";
import { finishKbJob, trackKbJob } from "../../src/modules/kb/kb-index-manifest.js";

test("KB failure fences only the job that owns the source", async (t) => {
  const calls: Array<unknown[]> = [];
  t.mock.method(redisConnection, "hset", async (...args: unknown[]) => {
    calls.push(["hset", ...args]);
    return 1;
  });
  t.mock.method(redisConnection, "eval", async (...args: unknown[]) => {
    calls.push(["eval", ...args]);
    return 1;
  });

  await trackKbJob("agent", ["kb"], "new-job");
  await finishKbJob("agent", ["kb"], "old-job", true);
  const hash = createHash("sha256").update("agent").digest("hex");
  assert.deepEqual(calls[0], ["hset", `quickvoice:kb:processing:${hash}`, "kb", "new-job"]);
  assert.equal(calls[1]?.[0], "eval");
  assert.equal(calls[1]?.[2], 2);
  assert.equal(calls[1]?.[3], `quickvoice:kb:index:${hash}`);
  assert.equal(calls[1]?.[4], `quickvoice:kb:processing:${hash}`);
  assert.deepEqual(calls[1]?.slice(5), ["kb", "old-job", "failed"]);
  assert.match(String(calls[1]?.[1]), /HGET', KEYS\[2\], ARGV\[1\]\) ~= ARGV\[2\]/);
  redisConnection.disconnect();
});
