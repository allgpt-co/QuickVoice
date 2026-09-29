import { createHash, createHmac } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { z } from "zod";
import prisma from "../../config/prisma.js";
import {
  amountMicros,
  DAY_MS,
  dayDate,
  daySchema,
  requiredSetting,
  shiftDay,
  utcDay,
  type SpendSource,
} from "./provider-spend.config.js";

export type SpendSample = {
  day: string;
  amountMicros: bigint;
  estimated: boolean;
  sourceAsOf: Date | null;
};
export type Collection = { samples: SpendSample[]; note: string };
type FetchJson = (url: string, init?: RequestInit) => Promise<unknown>;
const numeric = z.union([z.string(), z.number()]);

export async function fetchSpendJson(
  url: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      `Provider billing request failed (HTTP ${response.status})`,
    );
  // Never include provider response bodies or request headers in errors/emails.
  return response.json();
}

function days(
  from: string,
  to: string,
  estimated = false,
): Map<string, SpendSample> {
  const samples = new Map<string, SpendSample>();
  for (let day = from; day <= to; day = shiftDay(day, 1)) {
    samples.set(day, { day, amountMicros: 0n, estimated, sourceAsOf: null });
  }
  return samples;
}

export async function collectProviderSpend(
  source: SpendSource,
  now: Date,
  get: FetchJson = fetchSpendJson,
): Promise<Collection> {
  const today = utcDay(now);
  const from = shiftDay(today, -14);
  if (source.kind === "twilio") {
    const token = requiredSetting(source.tokenEnv ?? "TWILIO_AUTH_TOKEN");
    const root = `https://api.twilio.com/2010-04-01/Accounts/${source.account}/Usage/Records/Daily.json`;
    let url: string | null =
      `${root}?Category=totalprice&StartDate=${from}&EndDate=${today}&IncludeEmpty=true&PageSize=1000`;
    const samples = new Map<string, SpendSample>();
    const seen = new Set<string>();
    while (url) {
      if (seen.has(url) || seen.size >= 30)
        throw new Error("Incomplete Twilio usage pagination");
      seen.add(url);
      const page = z
        .object({
          usage_records: z.array(
            z.object({
              category: z.literal("totalprice"),
              start_date: daySchema,
              price: numeric,
              price_unit: z.string(),
              as_of: z.string().optional(),
            }),
          ),
          next_page_uri: z.string().nullable(),
        })
        .parse(
          await get(url, {
            headers: {
              Authorization: `Basic ${Buffer.from(`${source.account}:${token}`).toString("base64")}`,
            },
          }),
        );
      for (const record of page.usage_records) {
        if (record.price_unit.toUpperCase() !== "USD")
          throw new Error("Twilio spend monitor requires USD");
        if (record.start_date < from || record.start_date > today) continue;
        if (samples.has(record.start_date))
          throw new Error("Overlapping Twilio daily totals");
        const asOf = record.as_of ? new Date(record.as_of) : null;
        if (asOf && !Number.isFinite(asOf.getTime()))
          throw new Error("Invalid Twilio freshness timestamp");
        samples.set(record.start_date, {
          day: record.start_date,
          amountMicros: amountMicros(record.price),
          estimated: false,
          sourceAsOf: asOf,
        });
      }
      url = page.next_page_uri ? new URL(page.next_page_uri, root).href : null;
      if (
        url &&
        (!url.startsWith(root.split("?")[0]!) ||
          new URL(url).origin !== "https://api.twilio.com")
      )
        throw new Error("Unexpected Twilio pagination URL");
    }
    return {
      samples: [...samples.values()],
      note: "Twilio account totalprice; includes recurring charges. Provider reporting may lag. Subaccounts require their own monitor if excluded by this account's report.",
    };
  }
  if (source.kind === "deepgram") {
    const token = requiredSetting(source.tokenEnv ?? "DEEPGRAM_SPEND_API_KEY");
    const result = z
      .object({
        start: daySchema,
        end: daySchema,
        resolution: z.object({ units: z.literal("day"), amount: z.literal(1) }),
        results: z.array(
          z.object({
            dollars: numeric,
            grouping: z.object({ start: daySchema }),
          }),
        ),
      })
      .parse(
        await get(
          `https://api.deepgram.com/v1/projects/${encodeURIComponent(source.account)}/billing/breakdown?start=${from}&end=${shiftDay(today, 1)}`,
          {
            headers: { Authorization: `Token ${token}` },
          },
        ),
      );
    if (result.start > from || result.end < today)
      throw new Error("Incomplete Deepgram billing period");
    const samples = days(from, today);
    for (const row of result.results) {
      const sample = samples.get(row.grouping.start);
      if (sample) sample.amountMicros += amountMicros(row.dollars);
    }
    return {
      samples: [...samples.values()],
      note: "Deepgram project reported cost before QuickVoice markup; empty days in a successful report are zero. Provider data may be delayed.",
    };
  }
  if (source.kind === "livekit") return collectLiveKit(source, now, get);
  if (source.kind === "aws") return collectAws(source, now, get);
  const token = source.tokenEnv ? requiredSetting(source.tokenEnv) : undefined;
  const url = new URL(source.url!);
  url.searchParams.set("start", from);
  url.searchParams.set("end", today);
  const data = z
    .object({
      currency: z.literal("USD"),
      asOf: z.iso.datetime({ offset: true }),
      days: z.array(
        z.object({
          day: daySchema,
          amountUsd: numeric,
          estimated: z.boolean(),
        }),
      ),
    })
    .parse(
      await get(url.href, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    );
  if (new Set(data.days.map((d) => d.day)).size !== data.days.length)
    throw new Error("Duplicate daily provider totals");
  return {
    samples: data.days
      .filter((d) => d.day >= from && d.day <= today)
      .map((d) => ({
        day: d.day,
        amountMicros: amountMicros(d.amountUsd),
        estimated: d.estimated,
        sourceAsOf: new Date(data.asOf),
      })),
    note: "Custom billing feed; coverage and reporting delay are defined by the configured source.",
  };
}

async function collectLiveKit(
  source: SpendSource,
  now: Date,
  get: FetchJson,
): Promise<Collection> {
  const today = utcDay(now);
  const from = shiftDay(today, source.mode === "analytics" ? -6 : -14);
  const samples = days(from, today, true);
  if (source.mode === "application") {
    const sessions = await prisma.callBillingSession.findMany({
      where: {
        startedAt: { lte: now },
        OR: [{ endedAt: null }, { endedAt: { gte: dayDate(from) } }],
      },
      select: { startedAt: true, connectedMilliseconds: true },
    });
    for (const session of sessions) {
      if (!session.startedAt) continue;
      const milliseconds = Number(session.connectedMilliseconds);
      distributeMinutes(
        samples,
        session.startedAt,
        new Date(
          Math.min(now.getTime(), session.startedAt.getTime() + milliseconds),
        ),
        milliseconds / 60_000,
      );
    }
    return {
      samples: [...samples.values()],
      note: "ESTIMATE: QuickVoice-reported call connection minutes only, not LiveKit's invoice or participant minutes. Excludes traffic outside this database and usage missing from failed workers. Cross-midnight attribution uses the stored admission time.",
    };
  }
  const apiKey = requiredSetting(source.accessKeyEnv ?? "LIVEKIT_API_KEY");
  const secret = requiredSetting(source.secretEnv ?? "LIVEKIT_API_SECRET");
  const access = new AccessToken(apiKey, secret, { ttl: "10m" });
  access.addGrant({ roomList: true });
  const headers = { Authorization: `Bearer ${await access.toJwt()}` };
  const root = `https://cloud-api.livekit.io/api/project/${encodeURIComponent(source.account)}/sessions`;
  const seen = new Set<string>();
  // ponytail: cap at 1,000 sessions per collection; use incremental cached session
  // ingestion before supporting larger projects. Never report a truncated total.
  for (let page = 0; page <= 10; page++) {
    const result = z
      .object({ sessions: z.array(z.object({ sessionId: z.string().min(1) })) })
      .parse(
        await get(`${root}?start=${from}&end=${today}&limit=100&page=${page}`, {
          headers,
        }),
      );
    if (page === 10 && result.sessions.length)
      throw new Error(
        "LiveKit collection exceeds 1,000 sessions; incremental ingestion is required",
      );
    for (let offset = 0; offset < result.sessions.length; offset += 5) {
      const details = await Promise.all(
        result.sessions.slice(offset, offset + 5).map(async ({ sessionId }) => {
          if (seen.has(sessionId))
            throw new Error("Repeated LiveKit session in pagination");
          seen.add(sessionId);
          return z
            .object({
              startTime: z.string(),
              endTime: z.string().nullish(),
              connectionMinutes: z.number().finite().nonnegative(),
            })
            .parse(
              await get(`${root}/${encodeURIComponent(sessionId)}`, {
                headers,
              }),
            );
        }),
      );
      for (const detail of details)
        distributeMinutes(
          samples,
          new Date(detail.startTime),
          detail.endTime ? new Date(detail.endTime) : now,
          detail.connectionMinutes,
        );
    }
    if (result.sessions.length < 100) break;
  }
  return {
    samples: [...samples.values()],
    note: "LiveKit Cloud connection minutes, not dollar spend. Requires Scale+. Cross-midnight session totals are apportioned by elapsed time; API history is limited to seven days. Inference, deployment, bandwidth, and recording charges are not measured by this metric.",
  };
}

export function distributeMinutes(
  samples: Map<string, SpendSample>,
  start: Date,
  end: Date,
  minutes: number,
) {
  const duration = end.getTime() - start.getTime();
  if (
    !Number.isFinite(duration) ||
    duration < 0 ||
    !Number.isFinite(minutes) ||
    minutes < 0
  )
    throw new Error("Invalid connection duration");
  if (duration === 0) {
    const sample = samples.get(utcDay(start));
    if (sample) sample.amountMicros += amountMicros(minutes);
    return;
  }
  const total = amountMicros(minutes);
  for (const [day, sample] of samples) {
    const midnight = dayDate(day).getTime();
    const before = Math.max(0, Math.min(duration, midnight - start.getTime()));
    const after = Math.max(
      0,
      Math.min(duration, midnight + DAY_MS - start.getTime()),
    );
    sample.amountMicros +=
      (total * BigInt(after)) / BigInt(duration) -
      (total * BigInt(before)) / BigInt(duration);
  }
}

// Cost Explorer uses the same AWS SigV4 protocol as existing AWS integrations;
// built-in crypto avoids adding an SDK solely for one read-only API operation.
export function awsCostHeaders(
  body: string,
  now: Date,
  accessKey: string,
  secret: string,
  sessionToken?: string,
) {
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = stamp.slice(0, 8);
  const headers: Record<string, string> = {
    "content-type": "application/x-amz-json-1.1",
    host: "ce.us-east-1.amazonaws.com",
    "x-amz-date": stamp,
    "x-amz-target": "AWSInsightsIndexService.GetCostAndUsage",
    ...(sessionToken ? { "x-amz-security-token": sessionToken } : {}),
  };
  const names = Object.keys(headers).sort();
  const signed = names.join(";");
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const hmac = (key: string | Buffer, value: string) =>
    createHmac("sha256", key).update(value).digest();
  const canonical = [
    "POST",
    "/",
    "",
    names.map((name) => `${name}:${headers[name]}\n`).join(""),
    signed,
    hash(body),
  ].join("\n");
  const scope = `${date}/us-east-1/ce/aws4_request`;
  const key = hmac(
    hmac(hmac(hmac(`AWS4${secret}`, date), "us-east-1"), "ce"),
    "aws4_request",
  );
  const signature = hmac(
    key,
    `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${hash(canonical)}`,
  ).toString("hex");
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  return headers;
}

async function collectAws(
  source: SpendSource,
  now: Date,
  get: FetchJson,
): Promise<Collection> {
  const today = utcDay(now);
  const key = requiredSetting(source.accessKeyEnv ?? "AWS_SPEND_ACCESS_KEY_ID");
  const secret = requiredSetting(
    source.secretEnv ?? "AWS_SPEND_SECRET_ACCESS_KEY",
  );
  const sessionToken =
    process.env[source.sessionTokenEnv ?? "AWS_SPEND_SESSION_TOKEN"]?.trim();
  const samples = new Map<string, SpendSample>();
  const seen = new Set<string>();
  let next: string | undefined;
  do {
    const body = JSON.stringify({
      TimePeriod: { Start: shiftDay(today, -14), End: shiftDay(today, 1) },
      Granularity: "DAILY",
      Metrics: ["UnblendedCost"],
      Filter: {
        Dimensions: { Key: "LINKED_ACCOUNT", Values: [source.account] },
      },
      ...(next ? { NextPageToken: next } : {}),
    });
    const data = z
      .object({
        NextPageToken: z.string().optional(),
        ResultsByTime: z.array(
          z.object({
            TimePeriod: z.object({ Start: daySchema }),
            Estimated: z.boolean(),
            Total: z.object({
              UnblendedCost: z.object({
                Amount: numeric,
                Unit: z.literal("USD"),
              }),
            }),
          }),
        ),
      })
      .parse(
        await get("https://ce.us-east-1.amazonaws.com/", {
          method: "POST",
          headers: awsCostHeaders(body, new Date(), key, secret, sessionToken),
          body,
        }),
      );
    for (const row of data.ResultsByTime) {
      if (samples.has(row.TimePeriod.Start))
        throw new Error("Overlapping AWS daily totals");
      samples.set(row.TimePeriod.Start, {
        day: row.TimePeriod.Start,
        amountMicros: amountMicros(row.Total.UnblendedCost.Amount),
        estimated: row.Estimated,
        sourceAsOf: null,
      });
    }
    next = data.NextPageToken;
    if (next && (seen.has(next) || seen.size >= 30))
      throw new Error("Incomplete AWS billing pagination");
    if (next) seen.add(next);
  } while (next);
  return {
    samples: [...samples.values()],
    note: "AWS account UnblendedCost, including enabled paid services. Cost Explorer can lag up to 24 hours. Polled hourly by default because API requests incur a charge.",
  };
}
