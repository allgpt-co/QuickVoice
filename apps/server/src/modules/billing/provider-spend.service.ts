import { createHash, randomUUID } from "node:crypto";
import prisma from "../../config/prisma.js";
import { sendProviderSpendAlert } from "../../lib/mailer.js";
import { formatMicrosAsUsd } from "./money.js";
import {
  collectProviderSpend,
  type Collection,
  type SpendSample,
} from "./provider-spend.collectors.js";
import {
  alertLevel,
  amountMicros,
  dayDate,
  shiftDay,
  sourceId,
  sourceUnit,
  spendSettings,
  utcDay,
  type SpendSource,
} from "./provider-spend.config.js";

type Store = Pick<
  typeof prisma,
  "providerSpendDay" | "providerSpendAlert" | "providerSpendDelivery"
>;
type Settings = NonNullable<ReturnType<typeof spendSettings>>;
const digest = (parts: string[]) =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");

export function dailyBaseline(history: bigint[], fallback: bigint) {
  const total = history.reduce((sum, value) => sum + value, 0n);
  // Startup/zero-spend accounts need a usable threshold before history exists.
  return history.length >= 7 && total > 0n
    ? (total + BigInt(history.length) - 1n) / BigInt(history.length)
    : fallback;
}

function display(value: bigint, source: SpendSource) {
  return sourceUnit(source) === "USD"
    ? `$${formatMicrosAsUsd(value)}`
    : `${formatMicrosAsUsd(value)} connection minutes`;
}

export async function runProviderSpendMonitor(
  options: {
    now?: Date;
    settings?: Settings | null;
    db?: Store;
    collect?: (source: SpendSource, now: Date) => Promise<Collection>;
    send?: typeof sendProviderSpendAlert;
  } = {},
) {
  const settings =
    options.settings === undefined ? spendSettings() : options.settings;
  if (!settings) return { enabled: false, checked: 0, unavailable: 0, sent: 0 };
  const now = options.now ?? new Date();
  const db = options.db ?? prisma;
  const collect = options.collect ?? collectProviderSpend;
  const today = utcDay(now);
  const date = dayDate(today);
  const from = dayDate(shiftDay(today, -14));
  let checked = 0;
  let unavailable = 0;
  const failedSources = new Set<string>();
  const costSources = settings.sources.filter(
    (source) => sourceUnit(source) === "USD",
  );
  const combined: SpendSource | null =
    costSources.length > 1
      ? {
          key: "combined",
          kind: "http",
          account: digest(costSources.map(sourceId).sort()),
          baseline: costSources.reduce(
            (sum, source) => sum + source.baseline,
            0,
          ),
          minimum: costSources.reduce((sum, source) => sum + source.minimum, 0),
        }
      : null;
  const sources = combined ? [...settings.sources, combined] : settings.sources;

  async function combinedCollection(): Promise<Collection> {
    if (costSources.some((s) => failedSources.has(sourceId(s))))
      throw new Error("Combined cost data is incomplete");
    const totals = new Map<
      string,
      { amountMicros: bigint; count: number; estimated: boolean }
    >();
    for (const costSource of costSources) {
      const rows = await db.providerSpendDay.findMany({
        where: {
          sourceId: sourceId(costSource),
          day: { gte: from, lt: dayDate(shiftDay(today, 1)) },
        },
      });
      const current = rows.find((row) => utcDay(row.day) === today);
      const interval =
        (costSource.intervalMinutes ?? (costSource.kind === "aws" ? 60 : 5)) *
        60_000;
      if (
        !current ||
        now.getTime() - current.checkedAt.getTime() > interval * 2
      )
        throw new Error("Combined cost data is stale");
      for (const row of rows) {
        const day = utcDay(row.day);
        const total = totals.get(day) ?? {
          amountMicros: 0n,
          count: 0,
          estimated: false,
        };
        total.amountMicros += row.amountMicros;
        total.count++;
        total.estimated ||= row.estimated;
        totals.set(day, total);
      }
    }
    return {
      samples: [...totals]
        .filter(([, row]) => row.count === costSources.length)
        .map(([day, row]) => ({
          day,
          amountMicros: row.amountMicros,
          estimated: row.estimated,
          sourceAsOf: null,
        })),
      note: `Combined reported/estimated USD cost of ${costSources.map((s) => s.key).join(", ")}. LiveKit connection minutes are excluded. Includes only configured, non-overlapping accounts and inherits each provider's reporting delay.`,
    };
  }

  async function enqueue(
    source: SpendSource,
    severity: string,
    text: string,
    alertDay = today,
  ) {
    const id = digest([sourceId(source), alertDay, severity]);
    const subject = `[QuickVoice] ${severity.toUpperCase()}: ${source.key} ${severity === "unavailable" ? "monitoring unavailable" : "daily usage"}`;
    await db.providerSpendAlert.upsert({
      where: { id },
      update: {},
      create: {
        id,
        sourceId: sourceId(source),
        day: dayDate(alertDay),
        severity,
        subject,
        text,
      },
    });
    // Persist the alert first. A retry repairs any partially created deliveries.
    await db.providerSpendDelivery.createMany({
      data: settings!.recipients.map((email) => ({ alertId: id, email })),
      skipDuplicates: true,
    });
  }

  async function evaluateDay(
    source: SpendSource,
    current: SpendSample,
    note: string,
  ) {
    const id = sourceId(source);
    const date = dayDate(current.day);
    const from = dayDate(shiftDay(current.day, -14));
    const history = await db.providerSpendDay.findMany({
      where: { sourceId: id, day: { gte: from, lt: date } },
    });
    const incidents = await db.providerSpendAlert.findMany({
      where: {
        sourceId: id,
        day: { gte: from, lt: date },
        severity: { in: ["warning"] },
      },
      select: { day: true },
    });
    const excluded = new Set(incidents.map((incident) => utcDay(incident.day)));
    const baselineHistory = history.filter(
      (row) => !excluded.has(utcDay(row.day)),
    );
    const baseline = dailyBaseline(
      baselineHistory.map((row) => row.amountMicros),
      amountMicros(source.baseline),
    );
    const row = {
      amountMicros: current.amountMicros,
      estimated: current.estimated,
      checkedAt: now,
      sourceAsOf: current.sourceAsOf,
    };
    const existing = await db.providerSpendDay.findUnique({
      where: { sourceId_day: { sourceId: id, day: date } },
    });
    const frozen = {
      baselineMicros: existing?.baselineMicros ?? baseline,
      baselineDays:
        existing?.baselineMicros == null
          ? baselineHistory.length
          : existing.baselineDays,
    };
    const saved = await db.providerSpendDay.upsert({
      where: { sourceId_day: { sourceId: id, day: date } },
      // Freeze on first evaluation, including late reports for completed dates.
      create: { sourceId: id, day: date, ...frozen, ...row },
      update: { ...row, ...frozen },
    });
    const frozenBaseline = saved.baselineMicros ?? baseline;
    const severity = alertLevel(
      current.amountMicros,
      frozenBaseline,
      amountMicros(source.minimum),
      source.dailyCap === undefined ? undefined : amountMicros(source.dailyCap),
    );
    if (severity) {
      const multiple =
        Number((current.amountMicros * 100n) / frozenBaseline) / 100;
      await enqueue(
        source,
        severity,
        [
          `${source.key}: ${severity.toUpperCase()} daily usage alert`,
          `Account/project: ${source.account}`,
          `UTC day: ${current.day}`,
          `Day's ${current.estimated ? "estimated" : "reported"} usage: ${display(current.amountMicros, source)}`,
          `Frozen daily baseline: ${display(frozenBaseline, source)}`,
          `Usage / baseline: ${multiple.toFixed(2)}x`,
          `History: ${saved.baselineDays} eligible days; fewer than 7 or zero history uses the configured baseline.`,
          `Warning: 3x; minimum alert amount: ${display(amountMicros(source.minimum), source)}`,
          ...(source.dailyCap === undefined
            ? []
            : [
                `Absolute daily warning limit: ${display(amountMicros(source.dailyCap), source)}`,
              ]),
          `Collected at: ${now.toISOString()}`,
          `Provider data timestamp: ${current.sourceAsOf?.toISOString() ?? "not supplied; collection time is not a freshness guarantee"}`,
          note,
          "Provider expenses exclude QuickVoice markup. Review the provider dashboard and active calls. This alert does not stop calls.",
        ].join("\n"),
        current.day,
      );
    }
  }

  for (const source of sources) {
    const id = sourceId(source);
    const previous = await db.providerSpendDay.findUnique({
      where: { sourceId_day: { sourceId: id, day: date } },
    });
    const interval =
      (source.intervalMinutes ?? (source.kind === "aws" ? 60 : 5)) * 60_000;
    if (previous && now.getTime() - previous.checkedAt.getTime() < interval)
      continue;
    try {
      const result =
        source === combined
          ? await combinedCollection()
          : await collect(source, now);
      const current = result.samples.find((sample) => sample.day === today);
      if (
        !current ||
        new Set(result.samples.map((s) => s.day)).size !== result.samples.length
      )
        throw new Error("Daily provider report is incomplete");
      const maxAge = source.kind === "aws" ? 26 * 60 * 60_000 : 60 * 60_000;
      if (
        current.sourceAsOf &&
        (now.getTime() - current.sourceAsOf.getTime() > maxAge ||
          current.sourceAsOf.getTime() > now.getTime() + 5 * 60_000)
      )
        throw new Error("Provider data is stale");
      for (const sample of result.samples) {
        if (sample.amountMicros < 0n)
          throw new Error("Negative provider total");
        if (sample.day >= today || sample.day < shiftDay(today, -14)) continue;
        const row = {
          amountMicros: sample.amountMicros,
          estimated: sample.estimated,
          checkedAt: now,
          sourceAsOf: sample.sourceAsOf,
        };
        await db.providerSpendDay.upsert({
          where: { sourceId_day: { sourceId: id, day: dayDate(sample.day) } },
          create: { sourceId: id, day: dayDate(sample.day), ...row },
          update: row,
        });
      }
      // Recheck completed dates for provider charges published after midnight.
      for (const sample of result.samples
        .filter((s) => s.day >= shiftDay(today, -2) && s.day <= today)
        .sort((a, b) => a.day.localeCompare(b.day))) {
        await evaluateDay(source, sample, result.note);
      }
      checked++;
    } catch {
      failedSources.add(id);
      unavailable++;
      // One short outage need not page everyone; initial setup failures do.
      if (
        !previous ||
        now.getTime() - previous.checkedAt.getTime() >=
          Math.max(interval * 2, 30 * 60_000)
      ) {
        await enqueue(
          source,
          "unavailable",
          [
            `${source.key}: billing/usage monitoring is unavailable.`,
            `Account/project: ${source.account}`,
            `UTC day: ${today}`,
            `Last successful collection: ${previous?.checkedAt.toISOString() ?? "none today"}`,
            "No zero-spend value was substituted. Check credentials, provider permissions/plan, currency, pagination limits, and provider availability.",
            "Provider response bodies and secrets are deliberately excluded. Check the source configuration and provider dashboard.",
          ].join("\n"),
        );
      }
    }
  }

  const sourceIds = sources.map(sourceId);
  // Repair a crash between alert creation and recipient creation, including outages.
  const alerts = await db.providerSpendAlert.findMany({
    where: {
      sourceId: { in: sourceIds },
      day: { gte: dayDate(shiftDay(today, -7)) },
    },
  });
  for (const alert of alerts)
    await db.providerSpendDelivery.createMany({
      data: settings.recipients.map((email) => ({ alertId: alert.id, email })),
      skipDuplicates: true,
    });
  const sent = await deliverSpendAlerts(
    db,
    settings.recipients,
    sourceIds,
    options.now ?? new Date(),
    options.send ?? sendProviderSpendAlert,
  );
  return { enabled: true, checked, unavailable, sent };
}

export async function deliverSpendAlerts(
  db: Store,
  recipients: string[],
  sourceIds: string[],
  now: Date,
  send: typeof sendProviderSpendAlert,
) {
  const deliveryStarted = Date.now();
  const staleBefore = new Date(now.getTime() - 5 * 60_000);
  const pending = await db.providerSpendDelivery.findMany({
    where: {
      sentAt: null,
      email: { in: recipients },
      alert: {
        sourceId: { in: sourceIds },
        day: { gte: dayDate(shiftDay(utcDay(now), -7)) },
      },
      OR: [{ claimedAt: null }, { claimedAt: { lt: staleBefore } }],
    },
    include: { alert: true },
    orderBy: [{ attempts: "asc" }, { alertId: "asc" }, { email: "asc" }],
    take: 100,
  });
  let sent = 0;
  let failed = 0;
  for (const delivery of pending) {
    const claimedAt = new Date(now.getTime() + Date.now() - deliveryStarted);
    const claimToken = randomUUID();
    const identity = { alertId: delivery.alertId, email: delivery.email };
    const claim = await db.providerSpendDelivery.updateMany({
      where: {
        ...identity,
        sentAt: null,
        OR: [
          { claimedAt: null },
          { claimedAt: { lt: new Date(claimedAt.getTime() - 5 * 60_000) } },
        ],
      },
      data: { claimToken, claimedAt, attempts: { increment: 1 } },
    });
    if (!claim.count) continue;
    try {
      await send({
        email: delivery.email,
        subject: delivery.alert.subject,
        text: delivery.alert.text,
      });
      await db.providerSpendDelivery.updateMany({
        where: { ...identity, claimToken },
        data: { sentAt: new Date(), claimedAt: null, claimToken: null },
      });
      sent++;
    } catch {
      await db.providerSpendDelivery.updateMany({
        where: { ...identity, claimToken },
        data: { claimedAt: null, claimToken: null },
      });
      failed++;
    }
  }
  if (failed)
    throw new Error(
      `${failed} provider spend email deliveries failed; unsent recipients will retry`,
    );
  return sent;
}
