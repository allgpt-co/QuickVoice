import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, afterEach, test } from "node:test";
import type { Request } from "express";

import { redisConnection } from "../../src/config/redis.js";
import { clientIp } from "../../src/modules/widgets/widget.controller.js";
import {
  incrementWidgetRateLimit,
  widgetEndTokenMatches,
  widgetRateLimitPolicy,
} from "../../src/modules/widgets/widget.service.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

after(() => redisConnection.disconnect());

test("widget rate limiting uses Express's validated client IP instead of a forged forwarding header", () => {
  const request = {
    ip: "198.51.100.24",
    headers: { "x-forwarded-for": "203.0.113.99" },
    socket: { remoteAddress: "172.18.0.2" },
  } as unknown as Request;

  assert.equal(clientIp(request), "198.51.100.24");
});

test("one source cannot consume the widget-wide concurrent session pool", () => {
  delete process.env.WIDGET_SESSION_TTL_SECONDS;
  delete process.env.WIDGET_RATE_LIMIT_WINDOW_SECONDS;
  delete process.env.WIDGET_RATE_LIMIT_MAX_SESSIONS;
  delete process.env.WIDGET_MAX_CONCURRENT_SESSIONS_PER_WIDGET;
  assert.deepEqual(widgetRateLimitPolicy(), {
    windowSeconds: 900,
    maxSessions: 2,
  });

  process.env.WIDGET_SESSION_TTL_SECONDS = "1800";
  process.env.WIDGET_RATE_LIMIT_WINDOW_SECONDS = "60";
  process.env.WIDGET_RATE_LIMIT_MAX_SESSIONS = "99";
  process.env.WIDGET_MAX_CONCURRENT_SESSIONS_PER_WIDGET = "5";
  assert.deepEqual(widgetRateLimitPolicy(), {
    windowSeconds: 1800,
    maxSessions: 4,
  });
});

test("widget rate-limit increment and expiry execute atomically and repair missing TTLs", async () => {
  let invocation: unknown[] | undefined;
  const count = await incrementWidgetRateLimit(
    "quickvoice:widget:rate:test",
    900,
    {
      eval: async (...args: unknown[]) => {
        invocation = args;
        return 2;
      },
    },
  );

  assert.equal(count, 2);
  assert.equal(invocation?.[1], 1);
  assert.equal(invocation?.[2], "quickvoice:widget:rate:test");
  assert.equal(invocation?.[3], 900);
  const script = String(invocation?.[0]);
  assert.match(script, /redis\.call\("SET", KEYS\[1\], "1", "EX", ARGV\[1\]\)/);
  assert.match(script, /redis\.call\("TTL", KEYS\[1\]\) < 0/);
  assert.match(script, /redis\.call\("EXPIRE", KEYS\[1\], ARGV\[1\]\)/);
});

test("widget end tokens use a fixed-length timing-safe hash comparison", () => {
  const token = "test-end-token-at-least-20-characters";
  const hash = createHash("sha256").update(token).digest("hex");

  assert.equal(widgetEndTokenMatches(hash, token), true);
  assert.equal(widgetEndTokenMatches(hash, `${token}-wrong`), false);
  assert.equal(widgetEndTokenMatches("malformed", token), false);
});
