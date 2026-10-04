import assert from "node:assert/strict";
import { test } from "node:test";
import type { Server } from "node:http";
import express, { type RequestHandler } from "express";
import { createApiDocsRouter } from "../../src/modules/system/api-docs.route.js";
import { requestJson } from "../helpers/http-client.js";

const testAuth: RequestHandler = (req, res, next) => {
  if (req.headers.authorization !== "Bearer test") {
    res.sendStatus(401);
    return;
  }
  next();
};

async function startServer() {
  const app = express();
  app.use("/api/v1", createApiDocsRouter(testAuth));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () =>
      resolve(listeningServer),
    );
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind");
  return { server, baseUrl: `http://127.0.0.1:${address.port}/api/v1` };
}

async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("API specification and Swagger UI require authentication", async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => closeServer(server));

  assert.equal((await requestJson(`${baseUrl}/docs.json`)).status, 401);
  assert.equal((await requestJson(`${baseUrl}/docs/`)).status, 401);

  const response = await requestJson(`${baseUrl}/docs.json`, {
    headers: { Authorization: "Bearer test" },
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { openapi?: string };
  assert.equal(body.openapi, "3.0.3");
});
