import { createHash } from "node:crypto";

import { redisConnection } from "../../config/redis.js";

const finishScript = `
if redis.call('HGET', KEYS[2], ARGV[1]) ~= ARGV[2] then return 0 end
if ARGV[3] == 'failed' then
  local current = redis.call('HGET', KEYS[1], ARGV[1])
  if not current then
    redis.call('HSET', KEYS[1], ARGV[1], '!failed:legacy')
  elseif string.sub(current, 1, 1) ~= '!' then
    redis.call('HSET', KEYS[1], ARGV[1], '!failed:' .. current)
  end
end
redis.call('HDEL', KEYS[2], ARGV[1])
return 1
`;

function keys(agentId: string): [string, string] {
  const hash = createHash("sha256").update(agentId).digest("hex");
  return [`quickvoice:kb:index:${hash}`, `quickvoice:kb:processing:${hash}`];
}

export async function trackKbJob(agentId: string, kbIds: string[], jobId: string) {
  if (!kbIds.length) return;
  const [, ownerKey] = keys(agentId);
  await redisConnection.hset(ownerKey, ...kbIds.flatMap((kbId) => [kbId, jobId]));
}

export async function finishKbJob(
  agentId: string,
  kbIds: string[],
  jobId: string,
  failed: boolean,
) {
  const [indexKey, ownerKey] = keys(agentId);
  await Promise.all(kbIds.map((kbId) => redisConnection.eval(
    finishScript, 2, indexKey, ownerKey, kbId, jobId, failed ? "failed" : "succeeded",
  )));
}
