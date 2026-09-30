import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { trustedProxies } from "../../src/config/trusted-proxies.js";
import { requestJson } from "../helpers/http-client.js";

test("proxy trust requires explicit addresses and rejects blanket trust", () => {
  assert.equal(trustedProxies(""), false);
  assert.deepEqual(trustedProxies("127.0.0.1, 172.20.0.0/24,2001:db8::/32"), ["127.0.0.1", "172.20.0.0/24", "2001:db8::/32"]);
  for (const value of ["true", "1", "0.0.0.0/0", "::/0", "10.0.0.1/33", "::/129", "10.0.0.1/", "10.0.0.1/24/extra", "127.0.0.1,"]) {
    assert.throws(() => trustedProxies(value));
  }
});

test("forwarded IPs are trusted only through configured proxy hops", async () => {
  const app = express();
  app.set("trust proxy", trustedProxies(""));
  app.get("/ip", (req, res) => res.json({ ip: req.ip }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/ip`;
    const headers = { "x-forwarded-for": "198.51.100.99, 203.0.113.4", "cf-connecting-ip": "198.51.100.99" };
    assert.equal((await (await requestJson(url, { headers })).json()).ip, "127.0.0.1");
    app.set("trust proxy", trustedProxies("127.0.0.1"));
    assert.equal((await (await requestJson(url, { headers })).json()).ip, "203.0.113.4", "stop at first untrusted hop, ignore forged leftmost value");
    app.set("trust proxy", trustedProxies("127.0.0.1,203.0.113.4"));
    assert.equal((await (await requestJson(url, { headers })).json()).ip, "198.51.100.99");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
