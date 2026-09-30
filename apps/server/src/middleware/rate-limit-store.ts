import { Redis } from "ioredis";
import type { Options, Store } from "express-rate-limit";
import CustomApiError from "../common/errors/customApiError.js";

// INCR and expiry must be atomic across all API replicas. Later hits retain the
// original deadline, including blocked requests.
const incrementScript = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {hits, ttl}
`;

export class RedisRateLimitStore implements Store {
  localKeys = false;
  private windowMs = 60_000;

  constructor(private client: Redis, readonly prefix: string) {}

  init(options: Options) { this.windowMs = options.windowMs; }

  async increment(key: string) {
    try {
      const [totalHits, ttl] = await this.client.eval(
        incrementScript, 1, this.prefix + key, this.windowMs,
      ) as [number, number];
      return { totalHits, resetTime: new Date(Date.now() + ttl) };
    } catch {
      // Never silently fall back to independent counters during a Redis outage.
      throw new CustomApiError("Request limits are temporarily unavailable. Please retry shortly.", 503,
        { code: "RATE_LIMIT_STORE_UNAVAILABLE" });
    }
  }

  async decrement(key: string) {
    await this.client.eval(
      "if tonumber(redis.call('GET', KEYS[1]) or '0') > 0 then redis.call('DECR', KEYS[1]) end",
      1, this.prefix + key,
    );
  }

  async resetKey(key: string) { await this.client.del(this.prefix + key); }
}

let client: Redis | undefined;

export function rateLimitStore(scope: string): Store | undefined {
  const mode = process.env.RATE_LIMIT_STORE ?? (process.env.REDIS_URL ? "redis" : "memory");
  if (mode === "memory") {
    // ponytail: memory counters support one process only; configure REDIS_URL for replicas.
    if (process.env.NODE_ENV === "production" && process.env.RATE_LIMIT_STORE !== "memory") {
      throw new Error("Production rate limits require REDIS_URL (or explicit RATE_LIMIT_STORE=memory for one process)");
    }
    return undefined;
  }
  if (mode !== "redis" || !process.env.REDIS_URL) {
    throw new Error("RATE_LIMIT_STORE must be memory or redis; redis requires REDIS_URL");
  }
  client ??= new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 1000,
    commandTimeout: 1000,
  }).on("error", () => {
    console.error("[rate-limit] Redis connection unavailable");
  });
  return new RedisRateLimitStore(client, `quickvoice:rate-limit:v2:${scope}:`);
}

export function closeRateLimitStore() { client?.disconnect(); }
