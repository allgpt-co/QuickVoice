import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import express from "express";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { toNodeHandler } from "better-auth/node";
import { trustedProxies } from "../../src/config/trusted-proxies.js";
import { AUTH_CLIENT_IP_HEADER, AUTH_IP_ADDRESS_OPTIONS, authClientIpMiddleware } from "../../src/middleware/auth-client-ip.middleware.js";
import { requestJson } from "../helpers/http-client.js";

// Use the real Express adapter and Better Auth limiter with an in-memory DB.
const scenarios = [
  { name: "direct socket", proxies: "", clients: ["198.51.100.20", "198.51.100.21"] },
  { name: "one proxy", proxies: "127.0.0.1", clients: ["198.51.100.20", "198.51.100.21"] },
  { name: "proxy chain", proxies: "127.0.0.1,203.0.113.10", clients: ["198.51.100.20", "198.51.100.21"] },
  { name: "LAN", proxies: "127.0.0.1", clients: ["10.20.30.40", "10.20.30.41"] },
  { name: "VPN", proxies: "127.0.0.1", clients: ["100.64.0.10", "100.64.0.11"] },
  { name: "CDN", proxies: "127.0.0.1", clients: ["104.16.0.10", "104.16.0.11"] },
  // Express returns the furthest address even if every hop is trusted. Better
  // Auth must accept that final address rather than walking the chain again.
  { name: "client in proxy CIDR", proxies: "127.0.0.1,10.0.0.0/8", clients: ["10.20.30.40", "10.20.30.41"], pinned: true },
];
for (const { name, proxies, clients, pinned } of scenarios) {
  test(`auth rate limits preserve client buckets and ignore forged headers (${name})`, async (t) => {
    const db: Record<string, any[]> = { user: [], account: [], session: [], verification: [] };
    const app = express();
    app.set("trust proxy", trustedProxies(proxies));
    app.use(authClientIpMiddleware);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    t.after(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseURL = `http://127.0.0.1:${address.port}`;
    // Keep each test's limiter state independent of Better Auth's shared memory store.
    const signInPath = "/sign-in/email";
    const basePath = `/auth-${address.port}`;
    const buckets = new Map();
    const auth = betterAuth({
      baseURL, basePath,
      secret: "test-only-ip-secret-at-least-32-characters-long",
      database: memoryAdapter(db),
      advanced: { ipAddress: AUTH_IP_ADDRESS_OPTIONS },
      rateLimit: { enabled: true, customRules: { [signInPath]: { window: 60, max: 2 } },
        customStorage: {
          get: async (key) => buckets.get(key) ?? null,
          set: async (key, value) => { buckets.set(key, value); },
        },
      },
      emailAndPassword: { enabled: true },
      logger: { disabled: true },
    });
    app.all(`${basePath}/*splat`, toNodeHandler(auth));
    const send = (spoof: string, client = clients[0]!) => requestJson(`${baseURL}${basePath}${signInPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json", origin: baseURL,
        "x-forwarded-for": pinned ? client : proxies.includes("203.0.113.10") ? `${spoof}, ${client}, 203.0.113.10`
          : proxies ? `${spoof}, ${client}` : spoof,
        "x-real-ip": spoof, "cf-connecting-ip": spoof, forwarded: `for=${spoof}`,
        [AUTH_CLIENT_IP_HEADER]: spoof,
      },
      body: JSON.stringify({ email: "missing@example.test", password: "incorrect-password" }),
    });
    assert.equal((await send("192.0.2.1")).status, 401);
    assert.equal((await send("192.0.2.2")).status, 401);
    assert.equal((await send("192.0.2.3")).status, 429);
    assert.equal((await send("not-an-ip")).status, 429);
    const expectedIp = proxies ? clients[0]! : "127.0.0.1";
    assert.ok([...buckets.keys()].every((key) => key.startsWith(`${expectedIp}|`)));
    if (proxies) {
      assert.equal((await send("192.0.2.4", clients[1]!)).status, 401, "separate real clients get separate buckets");
      assert.ok([...buckets.keys()].some((key) => key.startsWith(`${clients[1]}|`)));
      assert.equal((await send("192.0.2.5")).status, 429, "first client remains limited");
    }
  });
}

test("invalid forwarded addresses fall back to the socket, and absent addresses fail closed", () => {
  let nextCalls = 0;
  const req: any = { ip: "invalid", socket: { remoteAddress: "::1" }, headers: { [AUTH_CLIENT_IP_HEADER]: "spoofed" } };
  const res: any = { status(code: number) { assert.equal(code, 400); return this; }, json() {} };
  authClientIpMiddleware(req, res, () => { nextCalls++; });
  assert.equal(req.headers[AUTH_CLIENT_IP_HEADER], "::1");
  req.socket.remoteAddress = undefined;
  authClientIpMiddleware(req, res, () => { nextCalls++; });
  assert.equal(nextCalls, 1);
});

test("production auth reads only the server-owned header and middleware precedes auth", () => {
  const auth = readFileSync(new URL("../../src/lib/auth.ts", import.meta.url), "utf8");
  assert.match(auth, /ipAddress:\s*AUTH_IP_ADDRESS_OPTIONS/);
  assert.deepEqual(AUTH_IP_ADDRESS_OPTIONS, {
    ipAddressHeaders: [AUTH_CLIENT_IP_HEADER], trustedProxies: [],
  });
  const main = readFileSync(new URL("../../src/index.ts", import.meta.url), "utf8");
  const trust = main.indexOf('app.set("trust proxy", trustedProxies())');
  const normalize = main.indexOf("app.use(authClientIpMiddleware)");
  assert.ok(trust >= 0 && normalize > trust && normalize < main.indexOf("toNodeHandler(auth)"));
});
