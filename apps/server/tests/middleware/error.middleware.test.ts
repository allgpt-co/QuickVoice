import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

import errorMiddleware from "../../src/middleware/error.middleware.js";

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
    (() => undefined) as any
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
      })
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
    (() => undefined) as any
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
  const error = Object.assign(new Error("private query values and credentials"), { code: "P2022" });
  const response = {
    status() { return this; },
    json() { return this; },
  };
  errorMiddleware(error, {
    headers: { authorization: "Bearer secret", "x-request-id": "req_tools" },
    method: "GET", route: { path: "/tools" }, body: { private: "patient data" },
  } as any, response as any, (() => undefined) as any);
  const entry = logged.mock.calls[0]?.arguments as unknown as [string, Record<string, unknown>];
  assert.equal(entry[1].errorCode, "P2022");
  assert.equal(entry[1].requestId, "req_tools");
  assert.doesNotMatch(JSON.stringify(entry), /private query|credentials|Bearer secret|patient data/);
});
