import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createBatchCampaign,
  createBatchUploadUrl,
  dispatchBatchCampaign,
  exportBatchCampaignResultsCsv,
  importBatchCampaignRecipients,
} from "../../src/modules/outbound/outbound-batch.service.js";

const TEST_UPLOAD_ID = "8d55565f-1111-4111-8111-f95fd03f0df2";

test("createBatchUploadUrl signs the normalized type and exact content length", async () => {
  const calls: unknown[][] = [];
  const result = await createBatchUploadUrl(
    {
      organizationId: "org_123",
      fileName: "recipients.CSV",
      contentType: "text/csv; charset=utf-8",
      fileSize: 1_024,
    },
    {
      randomUUID: () => TEST_UPLOAD_ID,
      generateUploadUrl: async (...args) => {
        calls.push(args);
        return "https://storage.example/upload";
      },
    },
  );

  assert.deepEqual(calls, [
    [`outbound-batches/org_123/${TEST_UPLOAD_ID}.csv`, "text/csv", 1_024],
  ]);
  assert.equal(result.contentType, "text/csv");
});

test("createBatchCampaign queues the import job with a BullMQ-safe custom id", async () => {
  const calls: unknown[] = [];
  const campaign = {
    campaignId: "campaign_123",
    organizationId: "org_123",
    userId: "user_123",
    name: "June renewals",
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
    fromNumber: "+15551230000",
    scheduledAt: null,
    sourceFileKey: `outbound-batches/org_123/${TEST_UPLOAD_ID}.csv`,
    sourceFileName: "file.csv",
    ringingTimeoutSeconds: 45,
    timezone: "UTC",
    status: "SCHEDULED",
  };
  const repo = {
    getMonthlyUsage: async () => ({
      plan: "starter",
      includedMinutes: 100,
      usedSeconds: 0,
    }),
    getDialableNumber: async () => ({
      number: "+15551230000",
      provider: "TWILIO",
      sid: "PN123",
    }),
    createBatchCampaign: async (input: unknown) => {
      calls.push(["createCampaign", input]);
      return campaign;
    },
  };
  const queue = {
    add: async (...args: unknown[]) => {
      calls.push(["queue", ...args]);
    },
  };

  const result = await createBatchCampaign(
    {
      organizationId: "org_123",
      userId: "user_123",
      name: "June renewals",
      agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
      fromNumber: "+15551230000",
      sourceFileKey: `outbound-batches/org_123/${TEST_UPLOAD_ID}.csv`,
      sourceFileName: "file.csv",
      scheduledAt: null,
      timezone: "UTC",
      ringingTimeoutSeconds: 45,
    },
    { repository: repo, queue },
  );

  assert.equal(result, campaign);
  const queued = calls.find(
    (call) => (call as unknown[])[0] === "queue",
  ) as unknown[];
  assert.deepEqual(queued, [
    "queue",
    "import",
    { campaignId: "campaign_123" },
    {
      jobId: "outbound-batch-import-campaign_123",
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  ]);
});

test("importBatchCampaignRecipients persists valid and invalid file rows and schedules dispatch", async () => {
  const calls: unknown[] = [];
  const now = new Date("2026-06-21T10:00:00.000Z");
  const scheduledAt = new Date("2026-06-21T10:05:00.000Z");
  const csv = [
    "phone_number,language,voice_id,first_message,prompt,city,other_dyn_variable",
    "+15550001111,hi-IN,aura-2-athena-en,Hi {{city}},Prompt {{other_dyn_variable}},Mumbai,renewal",
    ",en-US,aura-2-asteria-en,Hi,Prompt,Austin,value",
  ].join("\n");

  const repo = {
    createBatchOutboundCalls: async (rows: unknown[]) => {
      calls.push(["createRows", rows]);
      return rows;
    },
    markBatchImported: async (campaignId: string, stats: unknown) => {
      calls.push(["markImported", campaignId, stats]);
    },
  };
  const campaignIntelligenceRepo = {
    getCampaignForImport: async (campaignId: string) => {
      calls.push(["loadCampaign", campaignId]);
      return {
        campaignId,
        organizationId: "org_123",
        userId: "user_123",
        agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
        fromNumber: "+15551230000",
        scheduledAt,
        sourceFileKey: `outbound-batches/org_123/${TEST_UPLOAD_ID}.csv`,
        sourceFileName: "file.csv",
        ringingTimeoutSeconds: 45,
        personalizationSchemas: [],
        experiments: [],
        goals: [],
      };
    },
  };
  const queue = {
    add: async (...args: unknown[]) => {
      calls.push(["queue", ...args]);
    },
  };

  await importBatchCampaignRecipients(
    { campaignId: "campaign_123" },
    {
      repository: repo,
      campaignIntelligenceRepository: campaignIntelligenceRepo,
      queue,
      readFile: async (key) => {
        calls.push(["readFile", key]);
        return Buffer.from(csv);
      },
      now: () => now,
    },
  );

  const createRows = calls.find(
    (call) => (call as unknown[])[0] === "createRows",
  ) as any[];
  assert.equal(createRows[1].length, 2);
  assert.deepEqual(createRows[1][0], {
    organizationId: "org_123",
    userId: "user_123",
    agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
    campaignId: "campaign_123",
    scheduledAt,
    phoneNumber: "+15550001111",
    fromNumber: "+15551230000",
    firstMessage: "Hi {{city}}",
    systemPrompt: "Prompt {{other_dyn_variable}}",
    mode: "campaign",
    status: "SCHEDULED",
    optionalData: {
      rowNumber: 2,
      language: "hi-IN",
      voiceId: "aura-2-athena-en",
      dynamicVariables: {
        city: "Mumbai",
        other_dyn_variable: "renewal",
      },
      recipientKey: "+15550001111",
      recipientValues: {
        city: "Mumbai",
        other_dyn_variable: "renewal",
      },
      ringingTimeoutSeconds: 45,
      sourceFileName: "file.csv",
      importError: null,
      preflightFindings: [],
      preflightRenderedPreview: {},
      preflightRenderedConfigDigest: "",
    },
  });
  assert.equal(createRows[1][1].status, "FAILED");
  assert.equal(
    createRows[1][1].optionalData.importError,
    "phone_number is required",
  );

  assert.deepEqual(
    calls.find((call) => (call as unknown[])[0] === "markImported"),
    [
      "markImported",
      "campaign_123",
      {
        totalRecipients: 2,
        validRecipients: 1,
        invalidRecipients: 1,
      },
    ],
  );
  assert.deepEqual(
    calls.find((call) => (call as unknown[])[0] === "queue"),
    [
      "queue",
      "dispatch-campaign",
      { campaignId: "campaign_123" },
      {
        delay: 300000,
        jobId: "outbound-batch-dispatch-campaign_123",
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    ],
  );
});

test("importBatchCampaignRecipients rejects oversized recipient sets and marks the campaign failed", async () => {
  const previousLimit = process.env.OUTBOUND_BATCH_MAX_RECIPIENTS;
  process.env.OUTBOUND_BATCH_MAX_RECIPIENTS = "1";
  let failedCampaignId: string | null = null;
  let rowsCreated = false;

  try {
    await assert.rejects(
      importBatchCampaignRecipients(
        { campaignId: "campaign_oversized" },
        {
          repository: {
            createBatchOutboundCalls: async () => {
              rowsCreated = true;
              return { count: 0 };
            },
            markBatchImported: async () => ({}),
            markCampaignFailed: async (campaignId: string) => {
              failedCampaignId = campaignId;
              return { count: 1 };
            },
          },
          campaignIntelligenceRepository: {
            getCampaignForImport: async (campaignId: string) => ({
              campaignId,
              organizationId: "org_123",
              userId: "user_123",
              agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
              fromNumber: "+15551230000",
              scheduledAt: null,
              sourceFileKey: "outbound-batches/org_123/file.csv",
              sourceFileName: "file.csv",
              ringingTimeoutSeconds: 45,
              personalizationSchemas: [],
              experiments: [],
              goals: [],
            }),
          },
          queue: {
            add: async () => undefined,
          },
          readFile: async () =>
            Buffer.from(
              ["phone_number", "+15550001111", "+15550002222"].join("\n"),
            ),
        },
      ),
      /1 recipient limit/,
    );
  } finally {
    if (previousLimit === undefined) {
      delete process.env.OUTBOUND_BATCH_MAX_RECIPIENTS;
    } else {
      process.env.OUTBOUND_BATCH_MAX_RECIPIENTS = previousLimit;
    }
  }

  assert.equal(rowsCreated, false);
  assert.equal(failedCampaignId, "campaign_oversized");
});

test("dispatchBatchCampaign queues dispatch-call jobs with BullMQ-safe custom ids", async () => {
  const calls: unknown[] = [];
  const repo = {
    getCampaignForDispatch: async (campaignId: string) => {
      calls.push(["loadCampaign", campaignId]);
      return { campaignId };
    },
    listScheduledOutboundIdsForCampaign: async (campaignId: string) => {
      calls.push(["listOutboundIds", campaignId]);
      return ["outbound_123", "outbound_456"];
    },
    markCampaignActive: async (campaignId: string) => {
      calls.push(["markActive", campaignId]);
    },
    markCampaignCompleted: async (campaignId: string) => {
      calls.push(["markCompleted", campaignId]);
    },
  };
  const queue = {
    add: async (...args: unknown[]) => {
      calls.push(["queue", ...args]);
    },
  };

  await dispatchBatchCampaign(
    { campaignId: "campaign_123" },
    { repository: repo, queue },
  );

  const queueCalls = calls.filter((call) => (call as unknown[])[0] === "queue");
  assert.deepEqual(queueCalls, [
    [
      "queue",
      "dispatch-call",
      { outboundId: "outbound_123" },
      {
        jobId: "outbound-call-dispatch-outbound_123",
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    ],
    [
      "queue",
      "dispatch-call",
      { outboundId: "outbound_456" },
      {
        jobId: "outbound-call-dispatch-outbound_456",
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    ],
  ]);
});

test("exportBatchCampaignResultsCsv flattens source questions and extracted answers", async () => {
  const campaign = {
    campaignId: "campaign_123",
    name: "Patient Check In",
    sourceFileName: "patients.csv",
    outboundCalls: [
      {
        outboundId: "outbound_1",
        phoneNumber: "+15550001111",
        fromNumber: "+15551230000",
        firstMessage: null,
        systemPrompt: null,
        status: "COMPLETED",
        scheduledAt: null,
        createdAt: new Date("2026-08-04T10:00:00.000Z"),
        updatedAt: new Date("2026-08-04T10:05:00.000Z"),
        optionalData: {
          rowNumber: 2,
          dynamicVariables: {
            patient_name: "Jane Smith",
            question_2: "Pain from 1-10?",
            question_1: "Do you have fever?",
          },
        },
        callLog: {
          callId: "call_1",
          status: "COMPLETED",
          startTime: new Date("2026-08-04T10:01:00.000Z"),
          endTime: new Date("2026-08-04T10:04:00.000Z"),
          durationSeconds: 180,
          metadata: {},
          dataExtracted: [
            {
              type: "String",
              name: "question_1_answer",
              description: "Patient response to question 1",
              value: "No",
            },
            {
              type: "String",
              name: "answer_2",
              description: "Patient response to question 2",
              value: "4",
            },
            {
              type: "String",
              name: "preferred_pharmacy",
              description: "Preferred pharmacy",
              value: "Main Street Pharmacy",
            },
          ],
          dataEvaluation: [
            {
              identifier: "questionnaire_completed",
              description: "Completed",
              value: true,
            },
          ],
        },
      },
      {
        outboundId: "outbound_2",
        phoneNumber: "",
        fromNumber: "+15551230000",
        firstMessage: null,
        systemPrompt: null,
        status: "FAILED",
        scheduledAt: null,
        createdAt: new Date("2026-08-04T09:00:00.000Z"),
        updatedAt: new Date("2026-08-04T09:00:00.000Z"),
        optionalData: {
          rowNumber: 3,
          importError: "phone_number is required",
          raw: {
            phone_number: "",
            patient_name: "Bad Row",
            question_1: "Do you have fever?",
          },
        },
        callLog: null,
      },
    ],
  };

  const result = await exportBatchCampaignResultsCsv(
    { organizationId: "org_123", campaignId: "campaign_123" },
    {
      repository: {
        getBatchCampaignResults: async (args) => {
          assert.deepEqual(args, {
            organizationId: "org_123",
            campaignId: "campaign_123",
          });
          return campaign as any;
        },
      },
    },
  );

  assert.equal(result.filename, "patient-check-in-results.csv");
  assert.equal(
    result.content,
    [
      "row_number,phone_number,outbound_status,call_status,call_id,outbound_id,duration_seconds,failure_reason,started_at,ended_at,patient_name,question_1,question_1_answer,question_2,question_2_answer,preferred_pharmacy,evaluation_questionnaire_completed",
      "2,+15550001111,COMPLETED,COMPLETED,call_1,outbound_1,180,,2026-08-04T10:01:00.000Z,2026-08-04T10:04:00.000Z,Jane Smith,Do you have fever?,No,Pain from 1-10?,4,Main Street Pharmacy,true",
      "3,,FAILED,,,outbound_2,,phone_number is required,,,Bad Row,Do you have fever?,,,,,",
    ].join("\n"),
  );
});

test("createBatchCampaign rejects immediately when plan minutes are exhausted", async () => {
  const calls: unknown[] = [];
  const repo = {
    getMonthlyUsage: async () => ({
      plan: "free",
      includedMinutes: 15,
      usedSeconds: 15 * 60,
    }),
    getDialableNumber: async () => {
      calls.push("dialable");
      return {
        number: "+15551230000",
        provider: "TWILIO",
        sid: "PN123",
      };
    },
    createBatchCampaign: async () => {
      throw new Error("should not create batch campaign");
    },
  };
  const queue = {
    add: async () => {
      throw new Error("should not queue import");
    },
  };

  await assert.rejects(
    createBatchCampaign(
      {
        organizationId: "org_123",
        userId: "user_123",
        name: "June renewals",
        agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
        fromNumber: "+15551230000",
        sourceFileKey: `outbound-batches/org_123/${TEST_UPLOAD_ID}.csv`,
        sourceFileName: "file.csv",
        scheduledAt: null,
        timezone: "UTC",
        ringingTimeoutSeconds: 45,
      },
      {
        repository: repo,
        queue,
        hasActiveLegacySubscription: async () => true,
      },
    ),
    /Plan minutes exhausted/,
  );

  assert.deepEqual(calls, []);
});
