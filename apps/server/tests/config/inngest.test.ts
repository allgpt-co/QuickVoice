import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import express from "express";
import { Inngest } from "inngest";
import { serve } from "inngest/express";
import { serverBaseUrl } from "../../src/config/origins.js";
import { getInngestServeOptions } from "../../src/config/inngest.js";
import { requestJson } from "../helpers/http-client.js";

test("Inngest serve options normalize canonical origins and reject unsafe configuration", () => {
  assert.deepEqual(getInngestServeOptions("https://api.quickvoice.co/api/v1/", "/api/inngest"), {
    serveOrigin: "https://api.quickvoice.co", servePath: "/api/inngest",
  });
  assert.equal(getInngestServeOptions("http://server:5000", "/api/inngest").serveOrigin, "http://server:5000");
  for (const origin of ["not-a-url", "file:///tmp", "https://user:password@example.com"]) {
    assert.throws(() => getInngestServeOptions(origin, "/api/inngest"));
  }
  for (const path of ["relative", "//other.example", "/path?query", "/path#fragment", "/path\\escape", "/white space"]) {
    assert.throws(() => getInngestServeOptions("https://api.quickvoice.co", path));
  }
  const main = readFileSync(new URL("../../src/index.ts", import.meta.url), "utf8");
  assert.match(main, /serveInngest\(\{[^}]*\.\.\.getInngestServeOptions\(\)/);
});

test("Inngest origin prefers explicit configuration over legacy and canonical server fallback", () => {
  const keys = ["INNGEST_SERVE_ORIGIN", "INNGEST_SERVE_HOST", "INNGEST_SERVE_PATH"] as const;
  const previous = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    assert.deepEqual(getInngestServeOptions(), { serveOrigin: new URL(serverBaseUrl).origin, servePath: "/api/inngest" });
    process.env.INNGEST_SERVE_HOST = "http://internal-server:5000";
    assert.equal(getInngestServeOptions().serveOrigin, "http://internal-server:5000");
    process.env.INNGEST_SERVE_ORIGIN = "https://api.quickvoice.co";
    process.env.INNGEST_SERVE_PATH = "/external/inngest";
    assert.deepEqual(getInngestServeOptions(), { serveOrigin: "https://api.quickvoice.co", servePath: "/external/inngest" });
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});

test("Inngest sync registers the same canonical URL with or without proxy trust", async () => {
  const registered: string[] = [];
  const client = new Inngest({ id: "registration-test", isDev: true, fetch: async (_url, init) => {
    if (init?.body) registered.push(JSON.parse(String(init.body)).url);
    return new Response(JSON.stringify({ status: 200, modified: true }), { status: 200 });
  } });
  const app = express();
  app.use(express.json());
  app.use("/api/inngest", serve({ client, functions: [], ...getInngestServeOptions("https://api.quickvoice.co", "/api/inngest") }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    for (const trust of [false, ["127.0.0.1"]]) {
      app.set("trust proxy", trust);
      for (const protocol of ["http", "https"]) {
        const response = await requestJson(`http://127.0.0.1:${address.port}/api/inngest`, {
          method: "PUT", headers: { host: "untrusted.example", "x-forwarded-proto": protocol, "content-type": "application/json" }, body: "{}",
        });
        assert.equal(response.status, 200, JSON.stringify(await response.json()));
      }
    }
    assert.deepEqual(registered, Array(4).fill("https://api.quickvoice.co/api/inngest"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
