import assert from "node:assert/strict";
import { test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import { z } from "zod";

import errorMiddleware from "../../src/middleware/error.middleware.js";
import { requestJson } from "../helpers/http-client.js";

async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("malformed JSON returns 400 INVALID_JSON", async (t) => {
  const app = express();
  app.use(express.json());
  app.post("/test", (_req, res) => res.sendStatus(204));
  app.use(errorMiddleware);
  const server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () =>
      resolve(listeningServer),
    );
  });
  t.after(() => closeServer(server));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind");

  const response = await requestJson(`http://127.0.0.1:${address.port}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"broken":',
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    code: "INVALID_JSON",
    message: "Request body must contain valid JSON",
    details: null,
    fieldErrors: {},
    requestId: null,
  });
});

test("errorMiddleware hides unexpected 500 error details and returns a consistent shape", () => {
  const response = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };

  errorMiddleware(
    new Error("database password leaked in stack detail"),
    { headers: { "x-request-id": "req_500" } } as any,
    response as any,
    (() => undefined) as any,
  );

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong try again later",
    details: null,
    fieldErrors: {},
    requestId: "req_500",
  });
});

test("errorMiddleware returns field-addressable Zod validation errors", () => {
  const schema = z.object({
    email: z.string().email("Email must be valid"),
    documents: z.array(
      z.object({
        name: z.string().min(1, "Document name is required"),
      }),
    ),
  });
  const parsed = schema.safeParse({
    email: "not-an-email",
    documents: [{ name: "" }],
  });
  assert.equal(parsed.success, false);

  const response = {
    statusCode: 0,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };

  errorMiddleware(
    parsed.error,
    { headers: { "x-request-id": "req_validation" } } as any,
    response as any,
    (() => undefined) as any,
  );

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(response.body.message, "Validation failed");
  assert.deepEqual(response.body.fieldErrors, {
    email: ["Email must be valid"],
    "documents.0.name": ["Document name is required"],
  });
  assert.equal(response.body.requestId, "req_validation");
  assert.equal(Array.isArray(response.body.details.issues), true);
});

test("unexpected errors log diagnostic codes without exception messages or request secrets", (t) => {
  const logged = t.mock.method(console, "error", () => undefined);
  const error = Object.assign(
    new Error("private query values and credentials"),
    { code: "P2022" },
  );
  const response = {
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  errorMiddleware(
    error,
    {
      headers: { authorization: "Bearer secret", "x-request-id": "req_tools" },
      method: "GET",
      route: { path: "/tools" },
      body: { private: "patient data" },
    } as any,
    response as any,
    (() => undefined) as any,
  );
  const entry = logged.mock.calls[0]?.arguments as unknown as [
    string,
    Record<string, unknown>,
  ];
  assert.equal(entry[1].errorCode, "P2022");
  assert.equal(entry[1].requestId, "req_tools");
  assert.doesNotMatch(
    JSON.stringify(entry),
    /private query|credentials|Bearer secret|patient data/,
  );
});
