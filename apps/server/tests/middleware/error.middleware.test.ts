import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

import errorMiddleware from "../../src/middleware/error.middleware.js";

function createResponse() {
  return {
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
}

test("errorMiddleware hides unexpected 500 error details and returns a consistent shape", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";

  try {
    const response = createResponse();

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
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});

test("errorMiddleware exposes unexpected error messages in development", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const response = createResponse();

    errorMiddleware(
      new Error("S3 connection failed during local testing"),
      { headers: { "x-request-id": "req_development_500" } } as any,
      response as any,
      (() => undefined) as any
    );

    assert.equal(response.statusCode, 500);
    assert.equal(response.body.message, "S3 connection failed during local testing");
    assert.equal(response.body.code, "INTERNAL_SERVER_ERROR");
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
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

  const response = createResponse();

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
