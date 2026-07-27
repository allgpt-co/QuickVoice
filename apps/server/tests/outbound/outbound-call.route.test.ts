import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";

import { requestJson } from "../helpers/http-client.js";

let server: Server;
let baseUrl: string;
let serviceArgs: unknown[] = [];
let listArgs: unknown[] = [];
let getArgs: unknown[] = [];
let cancelArgs: unknown[] = [];
let retryArgs: unknown[] = [];
let batchArgs: unknown[] = [];
let uploadUrlArgs: unknown[] = [];
let listBatchArgs: unknown[] = [];
let batchDetailArgs: unknown[] = [];

before(async () => {
  process.env.STRIPE_SECRET_KEY ||= "sk_test_placeholder";
  process.env.BETTER_AUTH_URL ||= "http://localhost:5000";
  process.env.BETTER_AUTH_SECRET ||= "test-secret-with-adequate-length-32chars";
  process.env.GOOGLE_CLIENT_ID ||= "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET ||= "test-google-client-secret";
  const { createOutboundCallRouter } =
    await import("../../src/modules/outbound/outbound-call.route.js");
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/outbound-calls",
    createOutboundCallRouter({
      authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
        req.auth = {
          userId: "user_123",
          activeOrganizationId: "org_123",
          authMethod: "session",
          session: null,
        };
        next();
      },
      requireCreatePermission: (
        _req: Request,
        _res: Response,
        next: NextFunction,
      ) => next(),
      requireReadPermission: (
        _req: Request,
        _res: Response,
        next: NextFunction,
      ) => next(),
      requireDeletePermission: (
        _req: Request,
        _res: Response,
        next: NextFunction,
      ) => next(),
      createQuickOutboundCall: async (args: unknown) => {
        serviceArgs.push(args);
        return {
          outbound: {
            outboundId: "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113",
            status: "IN_PROGRESS",
          },
          livekitParticipant: { participantId: "sip-participant-123" },
        };
      },
      listOutboundCalls: async (args: unknown) => {
        listArgs.push(args);
        return {
          items: [
            {
              outboundId: "out_failed",
              status: "FAILED",
              phoneNumber: "+15550001111",
              failureReason: "LiveKit unavailable",
            },
          ],
          count: 1,
          filters: { status: "FAILED" },
        };
      },
      getOutboundCall: async (args: unknown) => {
        getArgs.push(args);
        return {
          outboundId: "out_failed",
          status: "FAILED",
          phoneNumber: "+15550001111",
          failureReason: "LiveKit unavailable",
          updatedAt: "2026-06-20T00:00:00.000Z",
        };
      },
      cancelOutboundCall: async (args: unknown) => {
        cancelArgs.push(args);
        return {
          outboundId: "out_scheduled",
          status: "FAILED",
          cancellationReason: "No longer needed",
        };
      },
      retryOutboundCall: async (args: unknown) => {
        retryArgs.push(args);
        return {
          sourceOutboundId: "out_failed",
          retry: {
            outbound: {
              outboundId: "out_retry",
              status: "IN_PROGRESS",
            },
          },
        };
      },
      createBatchCampaign: async (args: any) => {
        batchArgs.push(args);
        return {
          campaignId: "campaign_123",
          status: "SCHEDULED",
          name: args.name,
        };
      },
      createBatchUploadUrl: async (args: unknown) => {
        uploadUrlArgs.push(args);
        return {
          uploadUrl: "https://s3.example.test/upload",
          s3Key: "outbound-batches/org_123/recipients.csv",
        };
      },
      listBatchCampaigns: async (args: unknown) => {
        listBatchArgs.push(args);
        return [
          {
            campaignId: "campaign_123",
            name: "June renewals",
            status: "SCHEDULED",
          },
        ];
      },
      getBatchCampaignDetail: async (args: unknown) => {
        batchDetailArgs.push(args);
        return {
          campaignId: "campaign_123",
          name: "June renewals",
          outboundCalls: [],
        };
      },
    } as any),
  );

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("POST /quick validates and dispatches a quick outbound call", async () => {
  serviceArgs = [];
  const response = await requestJson(`${baseUrl}/api/v1/outbound-calls/quick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
      phoneNumber: "+15550001111",
      fromNumber: "+15551230000",
      username: "Ada",
    }),
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(
    body.data.outbound.outboundId,
    "2b1f6d53-42f5-4cc7-9689-7b6f51a0c113",
  );
  assert.equal(serviceArgs.length, 1);
  assert.deepEqual(serviceArgs[0], {
    organizationId: "org_123",
    userId: "user_123",
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
    phoneNumber: "+15550001111",
    fromNumber: "+15551230000",
    username: "Ada",
  });
});

test("GET / returns outbound calls with count and applied filters", async () => {
  listArgs = [];
  const response = await requestJson(
    `${baseUrl}/api/v1/outbound-calls?status=FAILED&agentId=8d55565f-1111-4111-8111-f95fd03f0df2&limit=10&cursor=out_123`,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.count, 1);
  assert.equal(body.data.items[0].failureReason, "LiveKit unavailable");
  assert.deepEqual(listArgs[0], {
    organizationId: "org_123",
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
    status: "FAILED",
    limit: 10,
    cursor: "out_123",
  });
});

test("GET /batch-upload-url returns a presigned outbound batch upload target", async () => {
  uploadUrlArgs = [];
  const response = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/batch-upload-url?fileName=recipients.csv&contentType=text/csv&fileSize=1024`,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.uploadUrl, "https://s3.example.test/upload");
  assert.deepEqual(uploadUrlArgs[0], {
    organizationId: "org_123",
    fileName: "recipients.csv",
    contentType: "text/csv",
    fileSize: 1024,
  });
});

test("POST /batches validates and creates a scheduled batch campaign", async () => {
  batchArgs = [];
  const response = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/batches`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "June renewals",
        agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
        fromNumber: "+15551230000",
        sourceFileKey: "outbound-batches/org_123/recipients.csv",
        sourceFileName: "recipients.csv",
        scheduledAt: "2026-06-21T10:05:00.000Z",
        timezone: "UTC",
        ringingTimeoutSeconds: 45,
      }),
    },
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.campaignId, "campaign_123");
  assert.deepEqual(batchArgs[0], {
    organizationId: "org_123",
    userId: "user_123",
    name: "June renewals",
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
    fromNumber: "+15551230000",
    sourceFileKey: "outbound-batches/org_123/recipients.csv",
    sourceFileName: "recipients.csv",
    scheduledAt: new Date("2026-06-21T10:05:00.000Z"),
    timezone: "UTC",
    ringingTimeoutSeconds: 45,
  });
});

test("GET /batches returns batch campaigns before outbound id routing", async () => {
  listBatchArgs = [];
  const response = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/batches?agentId=8d55565f-1111-4111-8111-f95fd03f0df2`,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data[0].campaignId, "campaign_123");
  assert.deepEqual(listBatchArgs[0], {
    organizationId: "org_123",
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
  });
});

test("GET /batches/:campaignId returns batch detail before outbound id routing", async () => {
  batchDetailArgs = [];
  const response = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/batches/campaign_123`,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.campaignId, "campaign_123");
  assert.deepEqual(batchDetailArgs[0], {
    organizationId: "org_123",
    campaignId: "campaign_123",
  });
});

test("GET /:outboundId returns call detail with failure reason", async () => {
  getArgs = [];
  const response = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/out_failed`,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.outboundId, "out_failed");
  assert.equal(body.data.failureReason, "LiveKit unavailable");
  assert.deepEqual(getArgs[0], {
    organizationId: "org_123",
    outboundId: "out_failed",
  });
});

test("GET /:outboundId/status returns a compact polling payload", async () => {
  getArgs = [];
  const response = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/out_failed/status`,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.data, {
    outboundId: "out_failed",
    status: "FAILED",
    failureReason: "LiveKit unavailable",
    updatedAt: "2026-06-20T00:00:00.000Z",
  });
  assert.deepEqual(getArgs[0], {
    organizationId: "org_123",
    outboundId: "out_failed",
  });
});

test("POST /:outboundId/cancel records a cancellation reason", async () => {
  cancelArgs = [];
  const response = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/out_scheduled/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "No longer needed" }),
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.cancellationReason, "No longer needed");
  assert.deepEqual(cancelArgs[0], {
    organizationId: "org_123",
    userId: "user_123",
    outboundId: "out_scheduled",
    reason: "No longer needed",
  });
});

test("POST /:outboundId/retry dispatches a replacement call", async () => {
  retryArgs = [];
  const response = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/out_failed/retry`,
    {
      method: "POST",
    },
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.sourceOutboundId, "out_failed");
  assert.equal(body.data.retry.outbound.outboundId, "out_retry");
  assert.deepEqual(retryArgs[0], {
    organizationId: "org_123",
    userId: "user_123",
    outboundId: "out_failed",
  });
});
