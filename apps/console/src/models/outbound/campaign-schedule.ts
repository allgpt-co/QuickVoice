import { Temporal } from "temporal-polyfill";

/** Resolve a local clock consistently: earlier overlap, shift forward across gaps. */
export function campaignScheduleToIso(value: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) {
    throw new Error("Enter a valid local schedule date and time");
  }
  try {
    if (/:60(?:\.|$)/.test(value)) throw new Error("Invalid second");
    const local = Temporal.PlainDateTime.from(value.replace(" ", "T"), { overflow: "reject" });
    return new Date(local.toZonedDateTime(timeZone, { disambiguation: "compatible" }).epochMilliseconds).toISOString();
  } catch {
    throw new Error("Enter a valid calendar date, time and timezone");
  }
}
