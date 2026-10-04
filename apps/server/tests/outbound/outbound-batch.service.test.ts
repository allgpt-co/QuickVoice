import { nextCampaignDailyPass } from "../../src/modules/outbound/campaign-time.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBatchCampaignResultsCsv,
  cancelBatchCampaign,
  createBatchCampaign,
  createBatchUploadUrl,
  dispatchBatchCampaign,
  exportBatchCampaignResultsCsv,
  getBatchCampaignDetail,
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

test("createBatchCampaign requires a literal dot before the storage-key extension", async () => {
  let repositoryUsed = false;

  await assert.rejects(
    createBatchCampaign(
      {
        organizationId: "org_123",
        userId: "user_123",
        name: "Invalid upload reference",
        agentId: "8d55565f-1111-4111-8111-f95fd03f0df2",
        fromNumber: "+15551230000",
        sourceFileKey: `outbound-batches/org_123/${TEST_UPLOAD_ID}xcsv`,
        sourceFileName: "file.csv",
        scheduledAt: null,
        timezone: "UTC",
        ringingTimeoutSeconds: 45,
      },
      {
        repository: {
          getMonthlyUsage: async () => {
            repositoryUsed = true;
            throw new Error("repository must not be called");
          },
          getDialableNumber: async () => null,
          createBatchCampaign: async () => {
            throw new Error("repository must not be called");
          },
        },
        queue: {
          add: async () => {
            throw new Error("queue must not be called");
          },
        },
      },
    ),
    /Batch file reference is invalid for the active organization/,
  );

  assert.equal(repositoryUsed, false);
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

test("dispatchBatchCampaign queues only the database-reserved call slots and schedules another pump", async () => {
  const calls: unknown[] = [];
  const repo = {
    claimCampaignDispatchSlots: async (campaignId: string, now: Date) => {
      calls.push(["claimSlots", campaignId, now]);
      return {
        outboundIds: ["outbound_123", "outbound_456"],
        scheduledRemaining: 9_998,
        campaignActiveCalls: 2,
        dailyLimitReached: false,
      };
    },
    markCampaignActive: async (campaignId: string) => {
      calls.push(["markActive", campaignId]);
      return true;
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
    {
      repository: repo,
      queue,
      now: () => new Date("2026-10-01T12:00:00.000Z"),
    },
  );

  const queueCalls = calls.filter((call) => (call as unknown[])[0] === "queue");
  assert.deepEqual(queueCalls, [
    [
      "queue",
      "dispatch-call",
      { outboundId: "outbound_123" },
      {
        jobId: "outbound-call-dispatch-outbound_123",
        removeOnComplete: true,
        removeOnFail: 200,
      },
    ],
    [
      "queue",
      "dispatch-call",
      { outboundId: "outbound_456" },
      {
        jobId: "outbound-call-dispatch-outbound_456",
        removeOnComplete: true,
        removeOnFail: 200,
      },
    ],
    [
      "queue",
      "dispatch-campaign",
      { campaignId: "campaign_123" },
      {
        delay: 5_000,
        jobId: "outbound-batch-pump-campaign_123-1790856005000",
        removeOnComplete: true,
        removeOnFail: 200,
      },
    ],
  ]);
});

test("dispatch does nothing when cancellation wins the campaign claim", async () => {
  const calls: string[] = [];

  await dispatchBatchCampaign(
    { campaignId: "campaign_cancelled" },
    {
      repository: {
        markCampaignActive: async () => false,
        claimCampaignDispatchSlots: async () => {
          calls.push("list");
          return null;
        },
        markCampaignCompleted: async () => {
          calls.push("complete");
          return {} as never;
        },
      },
      queue: {
        add: async () => {
          calls.push("queue");
        },
      },
    },
  );

  assert.deepEqual(calls, []);
});

test("dispatchBatchCampaign waits until the next UTC day after reaching the daily limit", async () => {
  const calls: unknown[] = [];
  const now = new Date("2026-10-01T23:59:30.000Z");

  await dispatchBatchCampaign(
    { campaignId: "campaign_daily_limit" },
    {
      repository: {
        markCampaignActive: async () => true,
        claimCampaignDispatchSlots: async () => ({
          outboundIds: [],
          scheduledRemaining: 50,
          campaignActiveCalls: 0,
          dailyLimitReached: true,
        }),
        markCampaignCompleted: async () => {
          throw new Error("campaign must remain active");
        },
      },
      queue: {
        add: async (...args: unknown[]) => {
          calls.push(args);
        },
      },
      now: () => now,
    },
  );

  assert.deepEqual(calls, [
    [
      "dispatch-campaign",
      { campaignId: "campaign_daily_limit" },
      {
        delay: 30_000,
        jobId: `outbound-batch-pump-campaign_daily_limit-${Date.parse("2026-10-02T00:00:00.000Z")}`,
        removeOnComplete: true,
        removeOnFail: 200,
      },
    ],
  ]);
});

test("active campaign cancellation stops running rooms", async () => {
  const stopped: string[] = [];
  const campaign = {
    campaignId: "campaign_active",
    status: "ACTIVE",
  };

  const result = await cancelBatchCampaign(
    { organizationId: "org_123", campaignId: campaign.campaignId },
    {
      repository: {
        getBatchCampaignDetail: async () => campaign as never,
        markCampaignCancelled: async () =>
          ({
            cancelled: true,
            runningOutboundIds: ["outbound_1", "outbound_2"],
            campaign: { ...campaign, status: "CANCELLED" },
          }) as never,
      },
      stopCall: async (outboundId) => {
        stopped.push(outboundId);
      },
    },
  );

  assert.equal(result.status, "CANCELLED");
  assert.deepEqual(stopped, ["outbound_1", "outbound_2"]);
});

test("missing batch campaigns consistently raise 404 errors", async () => {
  const isNotFound = (error: unknown) => {
    assert.equal((error as { statusCode?: number }).statusCode, 404);
    assert.equal((error as Error).message, "Batch campaign not found");
    return true;
  };

  await assert.rejects(
    getBatchCampaignDetail(
      { organizationId: "org_123", campaignId: "missing" },
      { repository: { getBatchCampaignDetail: async () => null } },
    ),
    isNotFound,
  );
  await assert.rejects(
    cancelBatchCampaign(
      { organizationId: "org_123", campaignId: "missing" },
      {
        repository: {
          getBatchCampaignDetail: async () => null,
          markCampaignCancelled: async () => null,
        },
      },
    ),
    isNotFound,
  );
  await assert.rejects(
    exportBatchCampaignResultsCsv(
      { organizationId: "org_123", campaignId: "missing" },
      { repository: { getBatchCampaignResults: async () => null } },
    ),
    isNotFound,
  );
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

test("campaign CSV neutralizes formulas and quotes carriage returns", () => {
  const content = buildBatchCampaignResultsCsv({
    campaignId: "campaign_unsafe",
    name: "Unsafe values",
    sourceFileName: "unsafe.csv",
    outboundCalls: [
      {
        outboundId: "outbound_unsafe",
        phoneNumber: "+15550001111",
        fromNumber: "+15551230000",
        firstMessage: null,
        systemPrompt: null,
        status: "FAILED",
        scheduledAt: null,
        createdAt: new Date("2026-08-04T09:00:00.000Z"),
        updatedAt: new Date("2026-08-04T09:00:00.000Z"),
        optionalData: {
          rowNumber: 2,
          importError: "@SUM(1+1)",
          dynamicVariables: {
            customer_id: "=HYPERLINK(\"https://evil.example\")",
            notes: "first\rsecond",
            international_phone: "+919876543210",
            max_length_phone: "+123456789012345",
            formula_phone: "+15550001111+1",
            function_phone: "+SUM(1+1)",
            too_long_phone: "+1234567890123456",
            newline_phone: "+15550001111\n=1+1",
          },
        },
        callLog: null,
      },
    ],
  } as any);

  assert.match(content, /2,\+15550001111,FAILED/);
  assert.match(content, /,'@SUM\(1\+1\),/);
  assert.match(content, /"'=HYPERLINK\(""https:\/\/evil\.example""\)"/);
  assert.match(content, /"first\rsecond"/);
  assert.match(content, /,\+919876543210,\+123456789012345,/);
  assert.match(content, /,'\+15550001111\+1,'\+SUM\(1\+1\),/);
  assert.match(content, /,\+1234567890123456,/);
  assert.match(content, /"'\+15550001111\n=1\+1"/);
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


test("10,000 capacity-blocked recipients create one campaign retry and no per-call retries", async () => {
  const queued: { name: string; data: unknown; options: any }[] = [];
  await dispatchBatchCampaign({ campaignId: "large_campaign" }, {
    repository: {
      markCampaignActive: async () => true,
      claimCampaignDispatchSlots: async () => ({
        outboundIds: [], scheduledRemaining: 10_000, campaignActiveCalls: 10,
        dailyLimitReached: false,
      }),
      markCampaignCompleted: async () => { throw new Error("campaign still has recipients"); },
    },
    queue: { add: async (name, data, options) => { queued.push({ name, data, options }); } },
    now: () => new Date("2026-10-03T12:00:00Z"),
  });
  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.name, "dispatch-campaign");
  assert.deepEqual(queued[0]?.data, { campaignId: "large_campaign" });
  assert.ok(queued[0]?.options.delay > 0, "retry is delayed instead of busy-looping");
});

for (const [timezone, start, expected] of [
  ["America/New_York", "2026-09-29T14:00:00Z", "2026-10-02T14:00:00.000Z"],
  ["Asia/Kolkata", "2026-09-29T03:30:00Z", "2026-10-02T03:30:00.000Z"],
]) test(`daily quota resumes at campaign local clock in ${timezone}`, async () => {
  const now = new Date("2026-10-01T23:59:30Z");
  const resumeAt = nextCampaignDailyPass(now, new Date(start!), timezone!);
  assert.equal(resumeAt.toISOString(), expected);
  const queued: any[] = [];
  await dispatchBatchCampaign({ campaignId: "daily" }, {
    now: () => now,
    repository: {
      markCampaignActive: async () => true,
      claimCampaignDispatchSlots: async () => ({ outboundIds: [], scheduledRemaining: 10000, campaignActiveCalls: 0, dailyLimitReached: true, resumeAt }),
      markCampaignCompleted: async () => { throw new Error("must remain active"); },
    },
    queue: { add: async (...args: any[]) => { queued.push(args); } },
  });
  assert.equal(queued.length, 1);
  assert.equal(now.getTime() + queued[0][2].delay, Date.parse(expected!));
});

test("campaign retry recovers committed claims after Redis rejected the enqueue", async () => {
  let fail = true;
  const queued = new Set<string>();
  const repository = {
    markCampaignActive: async () => true,
    markCampaignCompleted: async () => { throw new Error("not complete"); },
    claimCampaignDispatchSlots: async () => ({ outboundIds: ["claimed-before-crash"], scheduledRemaining: 0, campaignActiveCalls: 1, dailyLimitReached: false }),
  };
  const queue = { add: async (name: string, _data: unknown, opts: any) => {
    if (fail) throw new Error("Redis unavailable");
    if (name === "dispatch-call") queued.add(opts.jobId);
  } };
  await assert.rejects(dispatchBatchCampaign({ campaignId: "c" }, { repository: repository as any, queue: queue as any }));
  fail = false;
  await dispatchBatchCampaign({ campaignId: "c" }, { repository: repository as any, queue: queue as any, reschedule: false });
  assert.deepEqual([...queued], ["outbound-call-dispatch-claimed-before-crash"]);
});

test("recovery retries a failed BullMQ job when its database claim still exists", async () => {
  let retried = 0;
  await dispatchBatchCampaign({ campaignId: "c" }, {
    repository: {
      markCampaignActive: async () => true,
      markCampaignCompleted: async () => { throw new Error("not complete"); },
      claimCampaignDispatchSlots: async () => ({ outboundIds: ["pending"], scheduledRemaining: 0, campaignActiveCalls: 1, dailyLimitReached: false }),
    } as any,
    reschedule: false,
    queue: {
      add: async () => { throw new Error("existing failed job must be retried, not added again"); },
      getJob: async () => ({ getState: async () => "failed", retry: async () => { retried++; } }),
    },
  });
  assert.equal(retried, 1);
});
