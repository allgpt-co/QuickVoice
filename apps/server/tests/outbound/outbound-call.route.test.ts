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
let conversionIngestArgs: unknown[] = [];
let reportPreviewArgs: unknown[] = [];
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
      ingestCampaignConversionEvent: async (args: unknown) => {
        conversionIngestArgs.push(args);
        return {
          campaignId: "campaign_123",
          accepted: true,
          canonical: {
            goalKey: "booking_created",
            dedupeKey: "booking_123",
            externalCustomerId: "cust_1",
          },
          findings: [],
          conversionId: "conv_1",
          attributedAssignments: 1,
        };
      },
      buildBatchCampaignReport: async (args: any) => {
        reportPreviewArgs.push(args);
        return {
          campaignId: args.campaignId,
          causalClaimAllowed: false,
          totals: {
            attempts: 10,
            connected: 2,
            conversions: 1,
            conversionValueCents: 2500,
            connectionRate: 0.2,
            conversionRate: 0.1,
          },
          variants: [],
          dataFreshnessAt: "2026-07-30T12:00:00.000Z",
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

test("campaign intelligence routes run before generic batch detail routing", async () => {
  conversionIngestArgs = [];
  reportPreviewArgs = [];
  const preflight = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/batches/campaign_123/personalization/preflight`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schema: {
          version: 1,
          fields: [
            {
              name: "firstName",
              type: "string",
              source: "audience_snapshot",
              required: true,
              missingBehavior: "skip",
              invalidBehavior: "skip",
            },
          ],
          templates: { firstMessage: "Hi {{firstName}}" },
        },
        recipients: [{ recipientKey: "cust_1", values: { firstName: "Ada" } }],
      }),
    },
  );
  assert.equal(preflight.status, 200);
  const preflightBody = await preflight.json();
  assert.equal(preflightBody.data.campaignId, "campaign_123");
  assert.equal(preflightBody.data.validRecipients, 1);
  assert.equal(
    preflightBody.data.rows[0].renderedPreview.firstMessage,
    "Hi Ada",
  );

  const assignments = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/batches/campaign_123/experiments/assignments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experiment: {
          experimentId: "exp_1",
          version: 1,
          hypothesis: "Variant improves connects",
          primaryMetric: "connected",
          stoppingPolicy: "Stop after minimum sample",
          variants: [
            {
              key: "control",
              name: "Control",
              allocationBps: 5000,
              isControl: true,
            },
            { key: "variant", name: "Variant", allocationBps: 5000 },
          ],
        },
        unitKeys: ["cust_1", "cust_2"],
      }),
    },
  );
  assert.equal(assignments.status, 200);
  const assignmentsBody = await assignments.json();
  assert.equal(assignmentsBody.data.assignments.length, 2);
  assert.equal(assignmentsBody.data.assignments[0].assignmentHash.length, 64);

  const conversion = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/batches/campaign_123/conversions/validate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalKey: "booking_created",
        dedupeKey: "booking_123",
        externalCustomerId: "cust_1",
        occurredAt: "2026-07-30T12:00:00.000Z",
        valueCents: 2500,
        currency: "USD",
        source: "crm-webhook",
      }),
    },
  );
  assert.equal(conversion.status, 200);
  const conversionBody = await conversion.json();
  assert.equal(conversionBody.data.accepted, true);

  const ingestion = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/batches/campaign_123/conversions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalKey: "booking_created",
        dedupeKey: "booking_456",
        externalCustomerId: "cust_1",
        occurredAt: "2026-07-30T12:00:01.000Z",
        valueCents: 1500,
        currency: "USD",
        source: "crm-webhook",
      }),
    },
  );
  assert.equal(ingestion.status, 200);
  const ingestionBody = await ingestion.json();
  assert.equal(ingestionBody.success, true);
  assert.equal(ingestionBody.data.accepted, true);
  assert.deepEqual(conversionIngestArgs[0], {
    organizationId: "org_123",
    campaignId: "campaign_123",
    goalKey: "booking_created",
    dedupeKey: "booking_456",
    externalCustomerId: "cust_1",
    occurredAt: new Date("2026-07-30T12:00:01.000Z"),
    valueCents: 1500,
    currency: "USD",
    source: "crm-webhook",
    evidence: {},
  });
  assert.equal(conversionBody.data.accepted, true);

  const report = await requestJson(
    `${baseUrl}/api/v1/outbound-calls/batches/campaign_123/reports/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        randomized: true,
        persistReport: false,
      }),
    },
  );
  assert.equal(report.status, 200);
  const reportBody = await report.json();
  assert.equal(reportBody.data.causalClaimAllowed, false);
  assert.equal(reportBody.data.totals.conversions, 1);
  assert.deepEqual(reportPreviewArgs[0], {
    organizationId: "org_123",
    campaignId: "campaign_123",
    randomized: true,
    persistReport: false,
  });
});
