import { randomUUID } from "node:crypto";
import {
  BillingTransactionType,
  CallBillingSessionStatus,
  Prisma,
  TelephonyCostReportStatus,
  TelephonyProvider,
  type CallBillingSession,
} from "../../../prisma/generated/prisma/client.js";
import prisma from "../../config/prisma.js";
import { telnyxClient } from "../../config/telnyx.js";
import { twilioClient } from "../../config/twilio.js";
import { isHostedBilling } from "../../config/billing-mode.js";
import {
  calculateTelephonyChargeMicros,
  parseRateCatalogSnapshot,
  type RateCatalog,
} from "./rate-catalog.service.js";
import {
  creditUsageAdjustment,
  debitUsageAdjustment,
  getBillingSummary,
} from "./wallet-ledger.service.js";

const CLAIM_STALE_MS = 5 * 60 * 1_000;
const TWILIO_PRICE_DELAY_MS = 2 * 60 * 1_000;
const TELNYX_REPORT_DELAY_MS = 15 * 60 * 1_000;
const RETRY_MS = 5 * 60 * 1_000;
const MAX_REPORT_BYTES = 10 * 1024 * 1024;
const REPORT_CLAIM_MS = 5 * 60 * 1_000;

export type ProviderFinalCost = {
  baseCostMicros: bigint;
  providerBillableSeconds: number | null;
};

type ReconciliationDependencies = {
  fetchTwilioCall: (callSid: string) => Promise<{
    price: string | null;
    priceUnit: string | null;
    duration: string | null;
    status: string;
  }>;
  createTelnyxReport: typeof createTelnyxReport;
  retrieveTelnyxReport: typeof retrieveTelnyxReport;
  fetchText: typeof fetchReportText;
};

const defaultDependencies: ReconciliationDependencies = {
  fetchTwilioCall: async (callSid) => {
    const call = await twilioClient.calls(callSid).fetch();
    return {
      price: call.price,
      priceUnit: call.priceUnit,
      duration: call.duration,
      status: call.status,
    };
  },
  createTelnyxReport,
  retrieveTelnyxReport,
  fetchText: fetchReportText,
};

/** Replaces rolling telephony estimates with the provider's posted charge. */
export async function reconcileTelephonyCosts(
  now = new Date(),
  dependencies: ReconciliationDependencies = defaultDependencies,
) {
  if (!isHostedBilling) {
    return { skipped: true, twilio: 0, telnyx: 0, missingProviderIds: 0 };
  }
  await promoteEndedDebtSessionsForReconciliation(now);
  const missingProviderIds = await retainMissingProviderIdSessions(now);
  const twilio = await reconcileTwilioSessions(now, dependencies);
  const telnyx = await reconcileTelnyxSessions(now, dependencies);
  return { skipped: false, twilio, telnyx, missingProviderIds };
}

async function promoteEndedDebtSessionsForReconciliation(now: Date) {
  await prisma.callBillingSession.updateMany({
    where: {
      status: CallBillingSessionStatus.DEBT,
      telephonyProvider: { not: null },
      endedAt: { not: null },
    },
    data: {
      status: CallBillingSessionStatus.RECONCILING,
      reconciliationNextAt: now,
    },
  });
}

async function retainMissingProviderIdSessions(now: Date) {
  const sessions = await prisma.callBillingSession.findMany({
    where: {
      status: CallBillingSessionStatus.RECONCILING,
      telephonyProvider: { not: null },
      providerCallId: null,
      OR: [
        { reconciliationNextAt: null },
        { reconciliationNextAt: { lte: now } },
      ],
    },
    select: { callBillingSessionId: true },
    take: 100,
  });
  for (const session of sessions) {
    await prisma.callBillingSession.updateMany({
      where: {
        callBillingSessionId: session.callBillingSessionId,
        status: CallBillingSessionStatus.RECONCILING,
        providerCallId: null,
      },
      data: {
        reconciliationAttempts: { increment: 1 },
        reconciliationClaimedAt: null,
        reconciliationNextAt: new Date(now.getTime() + 60 * 60 * 1_000),
        reconciliationLastError:
          "Provider call ID is missing; durable correlation/manual review required",
      },
    });
  }
  return sessions.length;
}

async function reconcileTwilioSessions(
  now: Date,
  dependencies: ReconciliationDependencies,
) {
  const candidates = await prisma.callBillingSession.findMany({
    where: {
      status: CallBillingSessionStatus.RECONCILING,
      telephonyProvider: TelephonyProvider.TWILIO,
      providerCallId: { not: null },
      endedAt: { lte: new Date(now.getTime() - TWILIO_PRICE_DELAY_MS) },
      OR: [
        { reconciliationNextAt: null },
        { reconciliationNextAt: { lte: now } },
      ],
    },
    orderBy: { endedAt: "asc" },
    take: 100,
  });
  let completed = 0;
  for (const session of candidates) {
    if (!(await claimSession(session, now))) continue;
    try {
      const call = await dependencies.fetchTwilioCall(session.providerCallId!);
      if (call.status !== "completed" || call.price === null) {
        await retrySession(session.callBillingSessionId, now, "Twilio price is not final yet");
        continue;
      }
      if (call.priceUnit?.toUpperCase() !== "USD") {
        throw new Error(`Unsupported Twilio billing currency: ${call.priceUnit}`);
      }
      await finalizeProviderCost(session, {
        baseCostMicros: parseProviderUsdToMicros(call.price),
        providerBillableSeconds: parseProviderSeconds(call.duration),
      }, now);
      completed += 1;
    } catch (error) {
      await retrySession(
        session.callBillingSessionId,
        now,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return completed;
}

async function reconcileTelnyxSessions(
  now: Date,
  dependencies: ReconciliationDependencies,
) {
  if (
    process.env.TELNYX_BILLING_CURRENCY?.trim().toUpperCase() !== "USD"
  ) {
    throw new Error(
      "TELNYX_BILLING_CURRENCY=USD is required for exact Telnyx reconciliation",
    );
  }
  await ensureTelnyxReportRows(now);
  const reports = await prisma.telephonyCostReport.findMany({
    where: {
      provider: TelephonyProvider.TELNYX,
      status: {
        in: [
          TelephonyCostReportStatus.PENDING,
          TelephonyCostReportStatus.PROCESSING,
          TelephonyCostReportStatus.FAILED,
        ],
      },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { periodStart: "asc" },
    take: 24,
  });
  let completed = 0;
  for (const report of reports) {
    const processingToken = randomUUID();
    if (
      !(await claimTelnyxReport(
        report.telephonyCostReportId,
        processingToken,
        now,
      ))
    ) {
      continue;
    }
    try {
      const remote = report.externalReportId
        ? await dependencies.retrieveTelnyxReport(report.externalReportId)
        : await dependencies.createTelnyxReport({
            startTime: report.periodStart,
            endTime: report.periodEnd,
            reportName: `quickvoice-${report.telephonyCostReportId}-${report.attempts + 1}`,
          });
      if (!remote.id) throw new Error("Telnyx did not return a CDR report ID");

      if (remote.status === 3 || remote.status === 4) {
        await updateClaimedTelnyxReport(
          report.telephonyCostReportId,
          processingToken,
          {
            status: TelephonyCostReportStatus.PENDING,
            externalReportId: null,
            attempts: { increment: 1 },
            nextAttemptAt: new Date(now.getTime() + RETRY_MS),
            lastError: `Telnyx CDR generation ended with status ${remote.status}; requesting a new generation`,
          },
        );
        continue;
      }
      if (remote.status !== 2 || !remote.reportUrl) {
        await updateClaimedTelnyxReport(
          report.telephonyCostReportId,
          processingToken,
          {
            status: TelephonyCostReportStatus.PROCESSING,
            externalReportId: remote.id,
            attempts: { increment: 1 },
            nextAttemptAt: new Date(now.getTime() + 2 * 60 * 1_000),
            lastError: null,
          },
        );
        continue;
      }

      const costs = parseTelnyxCdrCsv(
        await dependencies.fetchText(remote.reportUrl),
      );
      const sessions = await prisma.callBillingSession.findMany({
        where: {
          status: CallBillingSessionStatus.RECONCILING,
          telephonyProvider: TelephonyProvider.TELNYX,
          // Provider and LiveKit timestamps can land on opposite sides of an
          // hour boundary. Search adjacent admission buckets and correlate by
          // the exact provider call id.
          startedAt: {
            gte: new Date(report.periodStart.getTime() - 60 * 60 * 1_000),
            lt: new Date(report.periodEnd.getTime() + 60 * 60 * 1_000),
          },
          providerCallId: { not: null },
        },
      });
      let unmatched = 0;
      for (const session of sessions) {
        const cost = costs.get(session.providerCallId!.trim());
        if (!cost) {
          unmatched += 1;
          if (await claimSession(session, now)) {
            await retrySession(
              session.callBillingSessionId,
              now,
              "Telnyx CDR is not available in this report generation",
            );
          }
          continue;
        }
        if (!(await claimSession(session, now))) continue;
        await finalizeProviderCost(session, cost, now);
        completed += 1;
      }
      await updateClaimedTelnyxReport(
        report.telephonyCostReportId,
        processingToken,
        unmatched > 0
            ? {
                status: TelephonyCostReportStatus.PENDING,
                externalReportId: null,
                reportUrl: remote.reportUrl,
                attempts: { increment: 1 },
                nextAttemptAt: new Date(now.getTime() + TELNYX_REPORT_DELAY_MS),
                lastError: `${unmatched} call(s) were not present; the report will be regenerated until correlated`,
                processedAt: null,
              }
            : {
                status: TelephonyCostReportStatus.COMPLETE,
                externalReportId: remote.id,
                reportUrl: remote.reportUrl,
                attempts: { increment: 1 },
                nextAttemptAt: null,
                lastError: null,
                processedAt: now,
              },
      );
    } catch (error) {
      await updateClaimedTelnyxReport(
        report.telephonyCostReportId,
        processingToken,
        {
          status: TelephonyCostReportStatus.FAILED,
          attempts: { increment: 1 },
          nextAttemptAt: new Date(now.getTime() + RETRY_MS),
          lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        },
      );
    }
  }
  return completed;
}

async function claimTelnyxReport(
  telephonyCostReportId: string,
  processingToken: string,
  now: Date,
) {
  const claimed = await prisma.telephonyCostReport.updateMany({
    where: {
      telephonyCostReportId,
      status: {
        in: [
          TelephonyCostReportStatus.PENDING,
          TelephonyCostReportStatus.PROCESSING,
          TelephonyCostReportStatus.FAILED,
        ],
      },
      OR: [
        { processingToken: null },
        { processingExpiresAt: null },
        { processingExpiresAt: { lte: now } },
      ],
    } as unknown as Prisma.TelephonyCostReportWhereInput,
    data: {
      status: TelephonyCostReportStatus.PROCESSING,
      processingToken,
      processingExpiresAt: new Date(now.getTime() + REPORT_CLAIM_MS),
    } as unknown as Prisma.TelephonyCostReportUpdateManyMutationInput,
  });
  return claimed.count === 1;
}

async function updateClaimedTelnyxReport(
  telephonyCostReportId: string,
  processingToken: string,
  data: Prisma.TelephonyCostReportUpdateManyMutationInput,
) {
  const updated = await prisma.telephonyCostReport.updateMany({
    where: {
      telephonyCostReportId,
      processingToken,
    } as unknown as Prisma.TelephonyCostReportWhereInput,
    data: {
      ...data,
      processingToken: null,
      processingExpiresAt: null,
    } as unknown as Prisma.TelephonyCostReportUpdateManyMutationInput,
  });
  if (updated.count !== 1) {
    throw new Error("Telnyx report processing claim was lost");
  }
}

async function ensureTelnyxReportRows(now: Date) {
  const sessions = await prisma.callBillingSession.findMany({
    where: {
      status: CallBillingSessionStatus.RECONCILING,
      telephonyProvider: TelephonyProvider.TELNYX,
      providerCallId: { not: null },
      startedAt: { not: null },
      endedAt: { lte: new Date(now.getTime() - TELNYX_REPORT_DELAY_MS) },
    },
    select: { startedAt: true },
    take: 500,
  });
  const periods = new Map<string, { start: Date; end: Date }>();
  for (const session of sessions) {
    const admissionHour = truncateUtcHour(session.startedAt!);
    for (const offset of [-1, 0, 1]) {
      const start = new Date(
        admissionHour.getTime() + offset * 60 * 60 * 1_000,
      );
      const end = new Date(start.getTime() + 60 * 60 * 1_000);
      if (end.getTime() + TELNYX_REPORT_DELAY_MS > now.getTime()) continue;
      periods.set(start.toISOString(), { start, end });
    }
  }
  for (const period of periods.values()) {
    const report = await prisma.telephonyCostReport.upsert({
      where: {
        provider_periodStart_periodEnd: {
          provider: TelephonyProvider.TELNYX,
          periodStart: period.start,
          periodEnd: period.end,
        },
      },
      create: {
        provider: TelephonyProvider.TELNYX,
        periodStart: period.start,
        periodEnd: period.end,
      },
      update: {},
    });
    // A unique hour row is reusable. If a delayed/long-running call appears
    // after the first completed generation, reopen the row and request a fresh
    // report instead of orphaning the session forever.
    if (
      report.status === TelephonyCostReportStatus.COMPLETE ||
      report.status === TelephonyCostReportStatus.EXPIRED
    ) {
      await prisma.telephonyCostReport.updateMany({
        where: {
          telephonyCostReportId: report.telephonyCostReportId,
          status: {
            in: [
              TelephonyCostReportStatus.COMPLETE,
              TelephonyCostReportStatus.EXPIRED,
            ],
          },
        },
        data: {
          status: TelephonyCostReportStatus.PENDING,
          externalReportId: null,
          nextAttemptAt: now,
          lastError: "Reopened for a delayed or adjacent-window CDR",
          processedAt: null,
        },
      });
    }
  }
}

export async function finalizeProviderCost(
  session: CallBillingSession,
  providerCost: ProviderFinalCost,
  now = new Date(),
) {
  const catalog = catalogFromSession(session);
  const telephonyFinalMicros = calculateTelephonyChargeMicros(
    providerCost.baseCostMicros,
    catalog,
  );
  const finalTotalMicros =
    session.aiCostMicros +
    session.platformCostMicros +
    sessionUnreportedTailMicros(session) +
    telephonyFinalMicros;
  const differenceMicros = finalTotalMicros - session.totalSettledMicros;
  let account;
  let additionalDebtMicros = 0n;

  if (differenceMicros > 0n) {
    const result = await debitUsageAdjustment({
      organizationId: session.organizationId,
      amountMicros: differenceMicros,
      idempotencyKey: `call:${session.callId}:provider-final:${session.rateCatalogVersion}`,
      referenceType: "call",
      referenceId: session.callId,
      description: "Provider-final telephony reconciliation",
      metadata: {
        provider: session.telephonyProvider,
        providerCallId: session.providerCallId,
        providerBaseCostMicros: providerCost.baseCostMicros.toString(),
      },
    });
    account = result.account;
    additionalDebtMicros = positive(result.transaction.debtDeltaMicros);
  } else if (differenceMicros < 0n) {
    const refundMicros = -differenceMicros;
    const funding = await callFundingSources(session);
    const refund = allocateUsageRefund(refundMicros, funding);
    const result = await creditUsageAdjustment({
      organizationId: session.organizationId,
      promotionalAmountMicros: refund.promotionalAmountMicros,
      paidAmountMicros: refund.paidAmountMicros,
      idempotencyKey: `call:${session.callId}:provider-final:${session.rateCatalogVersion}`,
      referenceType: "call",
      referenceId: session.callId,
      description: "Refund provider telephony over-estimate",
      metadata: {
        provider: session.telephonyProvider,
        providerCallId: session.providerCallId,
        providerBaseCostMicros: providerCost.baseCostMicros.toString(),
      },
    });
    account = result.account;
  } else {
    account = await getBillingSummary(session.organizationId);
  }

  const status =
    account.debtMicros > 0n
      ? CallBillingSessionStatus.DEBT
      : CallBillingSessionStatus.SETTLED;
  const updated = await prisma.callBillingSession.updateMany({
    where: {
      callBillingSessionId: session.callBillingSessionId,
      status: CallBillingSessionStatus.RECONCILING,
    },
    data: {
      status,
      telephonyFinalMicros,
      providerBillableSeconds: providerCost.providerBillableSeconds,
      totalSettledMicros: finalTotalMicros,
      debtIncurredMicros: session.debtIncurredMicros + additionalDebtMicros,
      reconciledAt: now,
      reconciliationClaimedAt: null,
      reconciliationNextAt: null,
      reconciliationLastError: null,
    },
  });
  if (updated.count !== 1) {
    const latest = await prisma.callBillingSession.findUniqueOrThrow({
      where: { callBillingSessionId: session.callBillingSessionId },
    });
    if (
      latest.status !== CallBillingSessionStatus.SETTLED &&
      latest.status !== CallBillingSessionStatus.DEBT
    ) {
      throw new Error("Provider reconciliation claim was lost before commit");
    }
  }
  await prisma.callLog.updateMany({
    where: { callId: session.callId, organizationId: session.organizationId },
    data: { callCostCents: microsToCents(finalTotalMicros) },
  });
  if (account.debtMicros > 0n) {
    requestAutoRecharge(session.organizationId);
  }
  return { status, telephonyFinalMicros, finalTotalMicros };
}

async function callFundingSources(session: CallBillingSession) {
  const reservations = await prisma.billingReservation.findMany({
    where: {
      organizationId: session.organizationId,
      referenceType: "call",
      referenceId: session.callId,
    },
    select: { billingReservationId: true },
  });
  const reservationIds = reservations.map((item) => item.billingReservationId);
  const transactions = await prisma.billingTransaction.findMany({
    where: {
      organizationId: session.organizationId,
      type: BillingTransactionType.CALL_SETTLEMENT,
      OR: [
        ...(reservationIds.length > 0
          ? [
              {
                referenceType: "billing_reservation",
                referenceId: { in: reservationIds },
              },
            ]
          : []),
        { referenceType: "call", referenceId: session.callId },
      ],
    },
  });
  let paidMicros = 0n;
  let promotionalMicros = 0n;
  let debtMicros = 0n;
  for (const transaction of transactions) {
    paidMicros += positive(
      -transaction.reservedPaidDeltaMicros - transaction.paidBalanceDeltaMicros,
    );
    promotionalMicros += positive(
      -transaction.reservedPromotionalDeltaMicros -
        transaction.promotionalBalanceDeltaMicros,
    );
    debtMicros += positive(transaction.debtDeltaMicros);
  }
  return { paidMicros, promotionalMicros, debtMicros };
}

export function allocateUsageRefund(
  refundMicros: bigint,
  funding: {
    paidMicros: bigint;
    promotionalMicros: bigint;
    debtMicros: bigint;
  },
) {
  // Usage consumes promo, then paid credit, then creates debt. A correction
  // must unwind that stack in reverse: debt first, then paid, then promo.
  // creditUsageAdjustment applies the paid-origin portion to outstanding debt
  // before making it spendable, preserving that exact reversal order.
  const paidAndDebtCapacity = funding.debtMicros + funding.paidMicros;
  const paidAmountMicros = minBigInt(refundMicros, paidAndDebtCapacity);
  return {
    paidAmountMicros,
    promotionalAmountMicros: refundMicros - paidAmountMicros,
  };
}

async function claimSession(session: CallBillingSession, now: Date) {
  const claimed = await prisma.callBillingSession.updateMany({
    where: {
      callBillingSessionId: session.callBillingSessionId,
      status: CallBillingSessionStatus.RECONCILING,
      OR: [
        { reconciliationClaimedAt: null },
        {
          reconciliationClaimedAt: {
            lt: new Date(now.getTime() - CLAIM_STALE_MS),
          },
        },
      ],
    },
    data: {
      reconciliationClaimedAt: now,
      reconciliationAttempts: { increment: 1 },
    },
  });
  return claimed.count === 1;
}

async function retrySession(id: string, now: Date, error: string) {
  await prisma.callBillingSession.updateMany({
    where: {
      callBillingSessionId: id,
      status: CallBillingSessionStatus.RECONCILING,
    },
    data: {
      reconciliationClaimedAt: null,
      reconciliationNextAt: new Date(now.getTime() + RETRY_MS),
      reconciliationLastError: error.slice(0, 500),
    },
  });
}

async function createTelnyxReport(args: {
  startTime: Date;
  endTime: Date;
  reportName: string;
}) {
  const response = await telnyxClient.legacy.reporting.batchDetailRecords.voice.create({
    start_time: args.startTime.toISOString(),
    end_time: args.endTime.toISOString(),
    fields: ["sip_call_id", "billable_time", "cost", "start_timestamp_utc"],
    record_types: [1],
    source: "calls",
    timezone: "UTC",
    report_name: args.reportName,
  });
  return {
    id: response.data?.id ?? null,
    status: response.data?.status ?? null,
    reportUrl: response.data?.report_url ?? null,
  };
}

async function retrieveTelnyxReport(id: string) {
  const response = await telnyxClient.legacy.reporting.batchDetailRecords.voice.retrieve(id);
  return {
    id: response.data?.id ?? id,
    status: response.data?.status ?? null,
    reportUrl: response.data?.report_url ?? null,
  };
}

async function fetchReportText(urlValue: string) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || !allowedTelnyxReportHost(url.hostname)) {
    throw new Error("Telnyx returned an untrusted CDR download URL");
  }
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) {
    throw new Error(`Telnyx CDR download failed with HTTP ${response.status}`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REPORT_BYTES) throw new Error("Telnyx CDR report is too large");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_REPORT_BYTES) throw new Error("Telnyx CDR report is too large");
  return new TextDecoder().decode(bytes);
}

export function parseTelnyxCdrCsv(csv: string): Map<string, ProviderFinalCost> {
  const rows = parseCsv(csv);
  if (rows.length === 0) return new Map();
  const headers = rows[0]!.map((value) => value.replace(/^\uFEFF/, "").trim().toLowerCase());
  const callIdIndex = headers.indexOf("sip_call_id");
  const costIndex = headers.indexOf("cost");
  const billableIndex = headers.indexOf("billable_time");
  if (callIdIndex < 0 || costIndex < 0 || billableIndex < 0) {
    throw new Error("Telnyx CDR is missing sip_call_id, cost, or billable_time");
  }
  const result = new Map<string, ProviderFinalCost>();
  for (const row of rows.slice(1)) {
    const callId = row[callIdIndex]?.trim();
    const rawCost = row[costIndex]?.trim();
    if (!callId || !rawCost) continue;
    const current = result.get(callId) ?? {
      baseCostMicros: 0n,
      providerBillableSeconds: 0,
    };
    current.baseCostMicros += parseProviderUsdToMicros(rawCost);
    current.providerBillableSeconds =
      (current.providerBillableSeconds ?? 0) +
      (parseProviderSeconds(row[billableIndex]) ?? 0);
    result.set(callId, current);
  }
  return result;
}

function parseCsv(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("Telnyx CDR contains an unterminated CSV quote");
  row.push(field.replace(/\r$/, ""));
  if (row.some((item) => item.length > 0)) rows.push(row);
  return rows;
}

function parseProviderUsdToMicros(raw: string) {
  const normalized = raw.trim().replace(/^[-+]/, "");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new Error(`Invalid provider USD cost: ${raw}`);
  const fraction = match[2] ?? "";
  const micros =
    BigInt(match[1]!) * 1_000_000n +
    BigInt(fraction.slice(0, 6).padEnd(6, "0") || "0");
  return micros + (/[1-9]/.test(fraction.slice(6)) ? 1n : 0n);
}

function parseProviderSeconds(raw: string | null | undefined) {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.max(0, Math.ceil(Number(value)));
  const clock = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
  if (!clock) return null;
  return Math.ceil(Number(clock[1]) * 3_600 + Number(clock[2]) * 60 + Number(clock[3]));
}

function catalogFromSession(session: CallBillingSession): Readonly<RateCatalog> {
  const snapshot = session.rateSnapshot as Record<string, unknown>;
  if (!snapshot.rateCatalog) throw new Error("Call has no immutable rate catalog snapshot");
  return parseRateCatalogSnapshot(snapshot.rateCatalog);
}

function allowedTelnyxReportHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return ["telnyx.com", "amazonaws.com", "cloudfront.net"].some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  );
}

function truncateUtcHour(value: Date) {
  const result = new Date(value);
  result.setUTCMinutes(0, 0, 0);
  return result;
}

function microsToCents(micros: bigint) {
  const value = (micros + 9_999n) / 10_000n;
  return Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : value);
}

function positive(value: bigint) {
  return value > 0n ? value : 0n;
}

function minBigInt(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function sessionUnreportedTailMicros(session: CallBillingSession) {
  return (
    session as CallBillingSession & { unreportedTailMicros?: bigint }
  ).unreportedTailMicros ?? 0n;
}

function requestAutoRecharge(organizationId: string) {
  void import("./stripe-wallet.service.js")
    .then(({ triggerAutoRecharge }) =>
      triggerAutoRecharge(organizationId, "threshold"),
    )
    .catch(() => undefined);
}
