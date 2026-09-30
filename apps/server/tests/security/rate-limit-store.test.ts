import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { Redis } from "ioredis";
import type { Options } from "express-rate-limit";
import { RedisRateLimitStore } from "../../src/middleware/rate-limit-store.js";

test("two replica stores share atomic counts, expiry and isolated namespaces", {
  skip: !process.env.TEST_RATE_LIMIT_REDIS_URL,
}, async () => {
  const client = new Redis(process.env.TEST_RATE_LIMIT_REDIS_URL!, { lazyConnect: true, maxRetriesPerRequest: 0 });
  await client.connect();
  const prefix = `test:rate-limit:${randomUUID()}:`;
  const a = new RedisRateLimitStore(client, prefix);
  const b = new RedisRateLimitStore(client, prefix);
  const internal = new RedisRateLimitStore(client, `${prefix}internal:`);
  a.init({ windowMs: 5000 } as Options);
  b.init({ windowMs: 5000 } as Options);
  try {
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => (i % 2 ? a : b).increment("alice")));
    assert.deepEqual(results.map((r) => r.totalHits).sort((x, y) => x - y), Array.from({ length: 100 }, (_, i) => i + 1));
    assert.equal((await a.increment("bob")).totalHits, 1);
    assert.equal((await internal.increment("alice")).totalHits, 1);
    await client.pexpire(`${prefix}alice`, 100);
    assert.ok((await b.increment("alice")).resetTime.getTime() - Date.now() <= 100, "hits must not extend the window");
    await setTimeout(150);
    assert.equal((await b.increment("alice")).totalHits, 1);
    await a.decrement("alice");
    await a.decrement("alice");
    assert.equal((await b.increment("alice")).totalHits, 1, "decrement cannot go negative");
    await b.resetKey("alice");
    assert.equal((await a.increment("alice")).totalHits, 1);
  } finally {
    await client.del(`${prefix}alice`, `${prefix}bob`, `${prefix}internal:alice`);
    client.disconnect();
  }
  await assert.rejects(a.increment("alice"), (error: any) => error.statusCode === 503 && error.code === "RATE_LIMIT_STORE_UNAVAILABLE");
});
