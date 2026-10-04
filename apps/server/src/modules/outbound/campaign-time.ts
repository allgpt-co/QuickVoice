import { Temporal } from "temporal-polyfill";

export function campaignLocalTime(value: string, timezone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) {
    throw new Error("Invalid local campaign time");
  }
  const local = Temporal.PlainDateTime.from(value.replace(" ", "T"), { overflow: "reject" });
  // Temporal permits leap-second 60; campaign clocks do not.
  if (/:60(?:\.|$)/.test(value)) throw new Error("Invalid campaign second");
  return new Date(local.toZonedDateTime(timezone, { disambiguation: "compatible" }).epochMilliseconds);
}

export function nextCampaignDailyPass(now: Date, start: Date, timezone: string): Date {
  const reset = Temporal.Instant.fromEpochMilliseconds(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const startClock = Temporal.Instant.fromEpochMilliseconds(start.getTime()).toZonedDateTimeISO(timezone).toPlainTime();
  let day = reset.toZonedDateTimeISO(timezone).toPlainDate();
  let candidate = day.toPlainDateTime(startClock).toZonedDateTime(timezone, { disambiguation: "compatible" });
  if (candidate.epochMilliseconds < reset.epochMilliseconds) {
    day = day.add({ days: 1 });
    candidate = day.toPlainDateTime(startClock).toZonedDateTime(timezone, { disambiguation: "compatible" });
  }
  return new Date(candidate.epochMilliseconds);
}
