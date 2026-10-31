import assert from "node:assert/strict";
import type { Server } from "node:http";
import { test } from "node:test";
import express from "express";

import errorMiddleware from "../../src/middleware/error.middleware.js";
import validate from "../../src/middleware/validate.middleware.js";
import { connectMcpSchema } from "../../src/modules/mcp/mcp.schema.js";
import { requestJson } from "../helpers/http-client.js";

test("MCP connection validation returns structured 400 errors before the handler", async (t) => {
  const app = express();
  let handlerCalls = 0;
  app.use(express.json());
  app.post(
    "/api/v1/mcp/connections",
    validate(connectMcpSchema),
    (req, res) => {
      handlerCalls += 1;
      res.status(201).json({ success: true, data: req.body });
    },
  );
  app.use(errorMiddleware);

  const server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () =>
      resolve(listeningServer),
    );
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/api/v1/mcp/connections`;
  const post = (body: Record<string, string>) =>
    requestJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": "mcp-validation-test",
      },
      body: JSON.stringify(body),
    });

  const malformed = await post({ customUrl: "not-a-valid-url" });
  assert.equal(malformed.status, 400);
  const error = await malformed.json<{
    success: boolean;
    code: string;
    message: string;
    fieldErrors: Record<string, string[]>;
    details: { issues: Array<{ path: string; message: string }> };
    requestId: string;
  }>();
  assert.equal(error.success, false);
  assert.equal(error.code, "VALIDATION_ERROR");
  assert.equal(error.message, "Validation failed");
  assert.deepEqual(error.fieldErrors.customUrl, ["Invalid URL"]);
  assert.ok(error.details.issues.some((issue) => issue.path === "customUrl"));
  assert.equal(error.requestId, "mcp-validation-test");
  assert.equal(handlerCalls, 0);

  const missing = await post({});
  assert.equal(missing.status, 400);
  assert.equal(handlerCalls, 0);

  const valid = await post({
    customUrl: " https://server.example.com/mcp ",
    authMode: "none",
  });
  assert.equal(valid.status, 201);
  assert.deepEqual(await valid.json(), {
    success: true,
    data: { customUrl: "https://server.example.com/mcp", authMode: "none" },
  });
  const catalog = await post({ catalogSlug: "example" });
  assert.equal(catalog.status, 201);
  assert.equal(handlerCalls, 2);
});
