import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  amountMicros,
  alertLevel,
  shiftDay,
  sourceId,
  spendSettings,
  type SpendSource,
} from "../../src/modules/billing/provider-spend.config.js";
import {
  awsCostHeaders,
  collectProviderSpend,
  distributeMinutes,
  fetchSpendJson,
  type Collection,
  type SpendSample,
} from "../../src/modules/billing/provider-spend.collectors.js";
import {
  dailyBaseline,
  deliverSpendAlerts,
  runProviderSpendMonitor,
} from "../../src/modules/billing/provider-spend.service.js";
import { sendProviderSpendAlert } from "../../src/lib/mailer.js";

const now = new Date("2026-09-28T12:00:00Z");
const env = { ...process.env };
const originalFetch = globalThis.fetch;
afterEach(() => {
  process.env = { ...env };
  globalThis.fetch = originalFetch;
});
const source: SpendSource = {
  key: "twilio",
  kind: "twilio",
  account: `AC${"1".repeat(32)}`,
  baseline: 20,
  minimum: 5,
};
const recipients = [
  "one@example.com",
  "two@example.com",
  "three@example.com",
  "four@example.com",
  "five@example.com",
];
const settings = { sources: [source], recipients };
const money = amountMicros;
const collection = (amount: number, baseline = 20): Collection => ({
  note: "Synthetic provider data",
  samples: Array.from({ length: 15 }, (_, i) => ({
    day: shiftDay("2026-09-28", -i),
    amountMicros: money(i ? baseline : amount),
    estimated: false,
    sourceAsOf: now,
  })),
});

// In-memory Prisma-shaped store exercises persistence/retry behavior, never a live database.
function memoryStore() {
  const days = new Map<string, any>();
  const alerts = new Map<string, any>();
  const deliveries = new Map<string, any>();
  const dayKey = (row: any) => `${row.sourceId}:${row.day.toISOString()}`;
  const eligibleClaim = (row: any, where: any) =>
    !row.sentAt &&
    (row.claimedAt === null || row.claimedAt < where.OR[1].claimedAt.lt);
  const db = {
    providerSpendDay: {
      findUnique: async ({ where }: any) =>
        days.get(dayKey(where.sourceId_day)) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const key = dayKey(where.sourceId_day);
        const row = days.has(key)
          ? { ...days.get(key), ...update }
          : { baselineMicros: null, baselineDays: 0, ...create };
        days.set(key, row);
        return row;
      },
      findMany: async ({ where }: any) =>
        [...days.values()].filter(
          (r) =>
            r.sourceId === where.sourceId &&
            r.day >= where.day.gte &&
            r.day < where.day.lt,
        ),
    },
    providerSpendAlert: {
      upsert: async ({ where, create }: any) => {
        if (!alerts.has(where.id)) alerts.set(where.id, create);
        return alerts.get(where.id);
      },
      findMany: async ({ where }: any) =>
        [...alerts.values()].filter(
          (r) =>
            (typeof where.sourceId === "string"
              ? r.sourceId === where.sourceId
              : where.sourceId.in.includes(r.sourceId)) &&
            r.day >= where.day.gte &&
            (!where.day.lt || r.day < where.day.lt) &&
            (!where.severity || where.severity.in.includes(r.severity)),
        ),
    },
    providerSpendDelivery: {
      createMany: async ({ data }: any) => {
        for (const row of data) {
          const key = `${row.alertId}:${row.email}`;
          if (!deliveries.has(key))
            deliveries.set(key, {
              ...row,
              sentAt: null,
              claimedAt: null,
              claimToken: null,
              attempts: 0,
            });
        }
      },
      findMany: async ({ where }: any) =>
        [...deliveries.values()]
          .filter(
            (r) =>
              where.email.in.includes(r.email) &&
              where.alert.sourceId.in.includes(
                alerts.get(r.alertId).sourceId,
              ) &&
              eligibleClaim(r, where),
          )
          .map((r) => ({ ...r, alert: alerts.get(r.alertId) })),
      updateMany: async ({ where, data }: any) => {
        const row = deliveries.get(`${where.alertId}:${where.email}`);
        if (
          !row ||
          (where.OR && !eligibleClaim(row, where)) ||
          (where.claimToken && row.claimToken !== where.claimToken)
        )
          return { count: 0 };
        const attempts = row.attempts + (data.attempts?.increment ?? 0);
        Object.assign(row, data, { attempts });
        return { count: 1 };
      },
    },
  };
  return {
    db: db as unknown as NonNullable<
      Parameters<typeof runProviderSpendMonitor>[0]
    >["db"],
    days,
    alerts,
    deliveries,
  };
}

test("disabled monitor does no collection or notification; configuration validates recipients and duplicate account scope", async () => {
  assert.equal(spendSettings({}), null);
  const result = await runProviderSpendMonitor({
    settings: null,
    collect: async () => {
      throw Error("must not collect");
    },
  });
  assert.equal(result.enabled, false);
  const input = {
    PROVIDER_SPEND_ALERTS_ENABLED: "true",
    PROVIDER_SPEND_ALERT_RECIPIENTS: "A@example.com,a@example.com",
    PROVIDER_SPEND_MONITORS: JSON.stringify([source]),
  };
  assert.deepEqual(spendSettings(input)!.recipients, ["a@example.com"]);
  assert.throws(() =>
    spendSettings({
      ...input,
      PROVIDER_SPEND_ALERT_RECIPIENTS: "bad\r\nBcc: victim@example.com",
    }),
  );
  assert.throws(
    () =>
      spendSettings({
        ...input,
        PROVIDER_SPEND_MONITORS: JSON.stringify([
          source,
          { ...source, key: "duplicate" },
        ]),
      }),
    /unique/,
  );
});

test("one warning level at 3x or higher, floors, absolute budgets, exact micros and cold start", () => {
  assert.equal(alertLevel(money(59.99), money(20), money(5)), null);
  assert.equal(alertLevel(money(60), money(20), money(5)), "warning");
  assert.equal(alertLevel(money(80), money(20), money(5)), "warning");
  assert.equal(alertLevel(money(100), money(20), money(5)), "warning");
  assert.equal(alertLevel(money(0.4), money(0.1), money(5)), null);
  assert.equal(
    alertLevel(money(30), money(20), money(5), money(30)),
    "warning",
  );
  assert.equal(dailyBaseline([], money(20)), money(20));
  assert.equal(dailyBaseline(Array(14).fill(0n), money(20)), money(20));
  assert.equal(dailyBaseline(Array(7).fill(money(10)), money(20)), money(10));
  assert.equal(money("0.0000001"), 1n);
  assert.throws(() => money(-1));
  assert.throws(() => money(null));
  assert.throws(() => money(Infinity));
});

test("daily snapshots replace totals and one warning reaches all five recipients despite 4x, 5x, and cap crossings", async () => {
  const store = memoryStore();
  const cappedSettings = {
    ...settings,
    sources: [{ ...source, dailyCap: 70 }],
  };
  const mail: any[] = [];
  const send = async (message: any) => {
    mail.push(message);
  };
  await runProviderSpendMonitor({
    settings: cappedSettings,
    now,
    db: store.db,
    collect: async () => collection(60),
    send,
  });
  assert.equal(mail.length, 5);
  assert.ok(
    mail.every(
      (m) => m.subject.includes("WARNING") && m.text.includes("3.00x"),
    ),
  );
  await runProviderSpendMonitor({
    settings: cappedSettings,
    now: new Date(now.getTime() + 6 * 60_000),
    db: store.db,
    collect: async () => {
      const report = collection(65, 100);
      report.samples[1]!.amountMicros = money(20);
      report.samples[2]!.amountMicros = money(20);
      return report;
    },
    send,
  });
  assert.equal(mail.length, 5);
  const today = [...store.days.values()].find((d) =>
    d.day.toISOString().startsWith("2026-09-28"),
  );
  assert.equal(today.amountMicros, money(65));
  assert.equal(today.baselineMicros, money(20));
  await runProviderSpendMonitor({
    settings: cappedSettings,
    now: new Date(now.getTime() + 12 * 60_000),
    db: store.db,
    collect: async () => {
      const report = collection(80, 100);
      report.samples[1]!.amountMicros = money(20);
      report.samples[2]!.amountMicros = money(20);
      return report;
    },
    send,
  });
  await runProviderSpendMonitor({
    settings: cappedSettings,
    now: new Date(now.getTime() + 18 * 60_000),
    db: store.db,
    collect: async () => collection(100),
    send,
  });
  assert.equal(mail.length, 5);
  assert.equal(store.alerts.size, 1);
  assert.ok(
    mail.every(
      (m) => m.subject.includes("WARNING") && !/critical/i.test(m.text),
    ),
  );
});

test("a failed recipient retries without resending to successful recipients, even when collection is skipped", async () => {
  const store = memoryStore();
  const mail: string[] = [];
  let fail = true;
  const send = async ({ email }: { email: string }) => {
    if (email === recipients[2] && fail) throw Error("SMTP unavailable");
    mail.push(email);
  };
  await assert.rejects(
    runProviderSpendMonitor({
      settings,
      now,
      db: store.db,
      collect: async () => collection(80),
      send,
    }),
    /1 provider spend email/,
  );
  assert.equal(mail.length, 4);
  fail = false;
  await runProviderSpendMonitor({
    settings,
    now,
    db: store.db,
    collect: async () => {
      throw Error("should skip fresh collection");
    },
    send,
  });
  assert.equal(mail.length, 5);
  assert.equal(new Set(mail).size, 5);
});

test("provider failures and stale data alert as unavailable and never replace stored spending with zero", async () => {
  const store = memoryStore();
  const mail: any[] = [];
  const send = async (m: any) => {
    mail.push(m);
  };
  await runProviderSpendMonitor({
    settings,
    now,
    db: store.db,
    collect: async () => collection(30),
    send,
  });
  const stale = new Date(now.getTime() + 31 * 60_000);
  await runProviderSpendMonitor({
    settings,
    now: stale,
    db: store.db,
    collect: async () => {
      throw Error("secret must not appear");
    },
    send,
  });
  assert.equal(mail.length, 5);
  assert.ok(
    mail.every(
      (m) =>
        m.subject.includes("UNAVAILABLE") && !m.text.includes("secret must"),
    ),
  );
  assert.equal(
    [...store.days.values()].find((r) =>
      r.day.toISOString().startsWith("2026-09-28"),
    ).amountMicros,
    money(30),
  );
  const first = memoryStore();
  const rows = collection(90);
  rows.samples[0]!.sourceAsOf = new Date(now.getTime() - 2 * 3_600_000);
  await runProviderSpendMonitor({
    settings,
    now,
    db: first.db,
    collect: async () => rows,
    send,
  });
  assert.equal(first.days.size, 0);
  assert.equal([...first.alerts.values()][0].severity, "unavailable");
});

test("concurrent delivery workers claim a recipient once and recover abandoned leases", async () => {
  const store = memoryStore();
  const alert = {
    id: "alert",
    sourceId: sourceId(source),
    day: now,
    subject: "test",
    text: "test",
  };
  store.alerts.set(alert.id, alert);
  store.deliveries.set("alert:one@example.com", {
    alertId: "alert",
    email: "one@example.com",
    sentAt: null,
    claimedAt: new Date(now.getTime() - 360_000),
    attempts: 0,
  });
  let sends = 0;
  const send = async () => {
    sends++;
    await new Promise((r) => setTimeout(r, 10));
  };
  await Promise.all(
    [1, 2].map(() =>
      deliverSpendAlerts(store.db!, recipients, [sourceId(source)], now, send),
    ),
  );
  assert.equal(sends, 1);
});

test("Twilio follows only account pagination and requires the expected currency and category", async () => {
  process.env.TWILIO_AUTH_TOKEN = "synthetic-token";
  let requests = 0;
  const result = await collectProviderSpend(source, now, async (url, init) => {
    requests++;
    assert.ok(url.includes("Category=totalprice"));
    assert.ok((init!.headers as any).Authorization.startsWith("Basic "));
    return {
      usage_records: [
        {
          category: "totalprice",
          start_date: "2026-09-28",
          price: "65.25",
          price_unit: "usd",
          as_of: now.toISOString(),
        },
      ],
      next_page_uri: null,
    };
  });
  assert.equal(requests, 1);
  assert.equal(result.samples[0]!.amountMicros, money(65.25));
  await assert.rejects(
    collectProviderSpend(source, now, async () => ({
      usage_records: [],
      next_page_uri: "https://evil.invalid/steal",
    })),
    /Unexpected Twilio/,
  );
  await assert.rejects(
    collectProviderSpend(source, now, async () => ({
      usage_records: [
        {
          category: "totalprice",
          start_date: "2026-09-28",
          price: "1",
          price_unit: "EUR",
        },
      ],
      next_page_uri: null,
    })),
    /requires USD/,
  );
});

test("Deepgram sums billing line items once, fills genuine zero days and rejects malformed reports", async () => {
  process.env.DEEPGRAM_SPEND_API_KEY = "synthetic-token";
  const deepgram = {
    ...source,
    key: "deepgram",
    kind: "deepgram" as const,
    account: "project-1",
  };
  const result = await collectProviderSpend(deepgram, now, async () => ({
    start: "2026-09-14",
    end: "2026-09-29",
    resolution: { units: "day", amount: 1 },
    results: [
      { dollars: 1.25, grouping: { start: "2026-09-28" } },
      { dollars: 2, grouping: { start: "2026-09-28" } },
    ],
  }));
  await assert.rejects(
    collectProviderSpend(deepgram, now, async () => ({
      start: "2026-09-14",
      end: "2026-09-29",
      resolution: { units: "month", amount: 1 },
      results: [],
    })),
  );
  await assert.rejects(
    collectProviderSpend(deepgram, now, async () => ({
      start: "2026-09-14",
      end: "2026-09-27",
      resolution: { units: "day", amount: 1 },
      results: [],
    })),
    /Incomplete Deepgram/,
  );
  assert.equal(result.samples.length, 15);
  assert.equal(result.samples.at(-1)!.amountMicros, money(3.25));
  assert.equal(result.samples[0]!.amountMicros, 0n);
  await assert.rejects(
    collectProviderSpend(deepgram, now, async () => ({
      error: "unauthorized",
    })),
  );
});

test("LiveKit connection minutes spanning midnight split across UTC dates without duplication", async () => {
  const samples = new Map<string, SpendSample>(
    ["2026-09-27", "2026-09-28"].map((day) => [
      day,
      { day, amountMicros: 0n, estimated: true, sourceAsOf: null },
    ]),
  );
  distributeMinutes(
    samples,
    new Date("2026-09-27T23:55:00Z"),
    new Date("2026-09-28T00:05:00Z"),
    20,
  );
  assert.equal(samples.get("2026-09-27")!.amountMicros, money(10));
  assert.equal(samples.get("2026-09-28")!.amountMicros, money(10));
  process.env.LIVEKIT_API_KEY = "test-key";
  process.env.LIVEKIT_API_SECRET = "test-secret-long-enough-for-token-signing";
  const livekit = {
    ...source,
    key: "livekit",
    kind: "livekit" as const,
    account: "p_test",
    mode: "analytics" as const,
  };
  const result = await collectProviderSpend(livekit, now, async (url) =>
    url.includes("?page=") || url.includes("&page=")
      ? { sessions: [{ sessionId: "room-1" }] }
      : {
          startTime: "2026-09-28T11:50:00Z",
          endTime: now.toISOString(),
          connectionMinutes: 20,
        },
  );
  assert.equal(result.samples.at(-1)!.amountMicros, money(20));
  assert.ok(result.note.includes("not dollar spend"));
});

test("AWS request is signed, scoped to the configured account, and handles pagination", async () => {
  process.env.AWS_SPEND_ACCESS_KEY_ID = "AKIDEXAMPLE";
  process.env.AWS_SPEND_SECRET_ACCESS_KEY = "test-secret";
  const aws = {
    ...source,
    key: "aws",
    kind: "aws" as const,
    account: "123456789012",
  };
  const requests: any[] = [];
  const result = await collectProviderSpend(aws, now, async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    requests.push(body);
    assert.deepEqual(body.Filter.Dimensions.Values, ["123456789012"]);
    assert.match(
      (init!.headers as any).Authorization,
      /SignedHeaders=content-type;host;x-amz-date;x-amz-target/,
    );
    return {
      ResultsByTime: [
        {
          TimePeriod: {
            Start: requests.length === 1 ? "2026-09-27" : "2026-09-28",
          },
          Estimated: true,
          Total: { UnblendedCost: { Amount: "2.12345678", Unit: "USD" } },
        },
      ],
      ...(requests.length === 1 ? { NextPageToken: "page2" } : {}),
    };
  });
  assert.equal(requests[1].NextPageToken, "page2");
  assert.equal(result.samples.length, 2);
  assert.equal(result.samples[0]!.amountMicros, 2_123_457n);
  const headers = awsCostHeaders(
    "{}",
    now,
    "AKIDEXAMPLE",
    "test-secret",
    "temporary-session",
  );
  assert.equal(headers["x-amz-security-token"], "temporary-session");
  assert.ok(headers.Authorization!.includes("x-amz-security-token"));
  // Independently generated with botocore.auth.SigV4Auth and fixed synthetic credentials/time.
  assert.ok(
    headers.Authorization!.endsWith(
      "Signature=3a81023383730d3a9350b7f0e89f0c250353533cda58f326690680a22ee7e209",
    ),
  );
});

test("combined monitor sums fresh USD sources once and excludes LiveKit minute usage", async () => {
  const store = memoryStore();
  const mail: any[] = [];
  const multiple = {
    recipients,
    sources: [
      source,
      {
        ...source,
        key: "deepgram",
        kind: "deepgram" as const,
        account: "deepgram-project",
      },
      {
        ...source,
        key: "livekit",
        kind: "livekit" as const,
        account: "p_test",
        mode: "analytics" as const,
      },
    ],
  };
  await runProviderSpendMonitor({
    settings: multiple,
    now,
    db: store.db,
    collect: async () => collection(65),
    send: async (m) => {
      mail.push(m);
    },
  });
  const total = [...store.alerts.values()].find((a) =>
    a.subject.includes("combined"),
  );
  assert.ok(total.text.includes("Day's reported usage: $130.00"));
  assert.ok(total.text.includes("Frozen daily baseline: $40.00"));
  assert.equal(mail.filter((m) => m.subject.includes("combined")).length, 5);
});

test("a new UTC day can alert again and prior incident days do not inflate its baseline", async () => {
  const store = memoryStore();
  const mail: any[] = [];
  const send = async (m: any) => {
    mail.push(m);
  };
  await runProviderSpendMonitor({
    settings,
    now,
    db: store.db,
    collect: async () => collection(300),
    send,
  });
  const tomorrow = new Date("2026-09-29T12:00:00Z");
  const next = collection(60);
  next.samples = next.samples.map((s, i) => ({
    ...s,
    day: shiftDay(s.day, 1),
    sourceAsOf: tomorrow,
    amountMicros: i === 1 ? money(300) : s.amountMicros,
  }));
  await runProviderSpendMonitor({
    settings,
    now: tomorrow,
    db: store.db,
    collect: async () => next,
    send,
  });
  const row = [...store.days.values()].find((d) =>
    d.day.toISOString().startsWith("2026-09-29"),
  );
  assert.equal(row.baselineMicros, money(20));
  assert.equal(row.baselineDays, 13);
  assert.equal(mail.length, 10);
});

test("late provider charges jumping directly to 4x send one warning for their original UTC day", async () => {
  const store = memoryStore();
  const mail: any[] = [];
  const send = async (m: any) => {
    mail.push(m);
  };
  await runProviderSpendMonitor({
    settings,
    now,
    db: store.db,
    collect: async () => collection(20),
    send,
  });
  const late = collection(20);
  late.samples[2]!.amountMicros = money(80);
  await runProviderSpendMonitor({
    settings,
    now: new Date(now.getTime() + 6 * 60_000),
    db: store.db,
    collect: async () => late,
    send,
  });
  assert.equal(mail.length, 5);
  assert.ok(
    mail.every(
      (m) =>
        m.text.includes("UTC day: 2026-09-26") && m.subject.includes("WARNING"),
    ),
  );
  late.samples[2]!.amountMicros = money(65);
  await runProviderSpendMonitor({
    settings,
    now: new Date(now.getTime() + 12 * 60_000),
    db: store.db,
    collect: async () => late,
    send,
  });
  assert.equal(mail.length, 5);
});

test("complete history is not invented when a provider omits today's total", async () => {
  const store = memoryStore();
  await runProviderSpendMonitor({
    settings,
    now,
    db: store.db,
    collect: async () => ({
      samples: collection(20).samples.slice(1),
      note: "Incomplete",
    }),
    send: async () => {},
  });
  assert.equal(store.days.size, 0);
  assert.equal([...store.alerts.values()][0].severity, "unavailable");
});

test("custom feeds reject duplicate days and HTTP failures never become zero spend", async () => {
  const custom = {
    ...source,
    key: "other",
    kind: "http" as const,
    account: "project",
    url: "https://billing.example.com/daily",
  };
  await assert.rejects(
    collectProviderSpend(custom, now, async () => ({
      currency: "USD",
      asOf: now.toISOString(),
      days: [1, 2].map(() => ({
        day: "2026-09-28",
        amountUsd: 4,
        estimated: false,
      })),
    })),
    /Duplicate/,
  );
  globalThis.fetch = async (_url, init) => {
    assert.equal(init!.redirect, "error");
    return new Response("sensitive failure body", { status: 503 });
  };
  await assert.rejects(
    fetchSpendJson("https://billing.example.com"),
    (error: any) =>
      error.message === "Provider billing request failed (HTTP 503)",
  );
});

test("spend email uses existing transport, escapes content and sends only to its designated recipient", async () => {
  process.env.ZEPTOMAIL_TOKEN = "synthetic";
  process.env.ZEPTOMAIL_URL = "https://api.zeptomail.com";
  process.env.FROM_EMAIL = "test@example.com";
  let payload: any;
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(init!.body as string);
    return new Response("{}", { status: 200 });
  };
  await sendProviderSpendAlert({
    email: recipients[0]!,
    subject: "Spend alert",
    text: "<script>test</script>",
  });
  assert.equal(payload.to.length, 1);
  assert.equal(payload.to[0].email_address.address, recipients[0]);
  assert.ok(payload.htmlbody.includes("&lt;script&gt;"));
  assert.ok(!payload.htmlbody.includes("<script>"));
});
