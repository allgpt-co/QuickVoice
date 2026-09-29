import { createHash } from "node:crypto";
import { z } from "zod";
import { parseUsdToMicros } from "./money.js";

export const DAY_MS = 86_400_000;
export const utcDay = (date: Date) => date.toISOString().slice(0, 10);
export const dayDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
export const shiftDay = (day: string, offset: number) =>
  utcDay(new Date(dayDate(day).getTime() + offset * DAY_MS));
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const date = dayDate(v);
    return Number.isFinite(date.getTime()) && utcDay(date) === v;
  });
const envName = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
const threshold = z.number().finite().min(0.000001).max(999_999_999_999);
const sourceSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,40}$/)
      .refine(
        (key) => key !== "combined",
        "combined is reserved for the total monitor",
      ),
    kind: z.enum(["twilio", "deepgram", "livekit", "aws", "http"]),
    account: z.string().regex(/^[a-zA-Z0-9_.-]{1,100}$/),
    // USD, except LiveKit which monitors connection minutes, not invoice dollars.
    baseline: threshold,
    minimum: threshold.default(5),
    dailyCap: threshold.optional(),
    intervalMinutes: z.number().int().min(5).max(1440).optional(),
    tokenEnv: envName.optional(),
    accessKeyEnv: envName.optional(),
    secretEnv: envName.optional(),
    sessionTokenEnv: envName.optional(),
    mode: z.enum(["analytics", "application"]).optional(),
    url: z
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.hash
        );
      })
      .optional(),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (source.kind === "livekit" && !source.mode)
      ctx.addIssue({ code: "custom", message: "LiveKit mode is required" });
    if (source.kind === "http" && !source.url)
      ctx.addIssue({ code: "custom", message: "HTTP source URL is required" });
    if (source.kind === "aws" && !/^\d{12}$/.test(source.account))
      ctx.addIssue({
        code: "custom",
        message: "AWS account must be a 12-digit linked account ID",
      });
    if (source.kind === "twilio" && !/^AC[a-fA-F0-9]{32}$/.test(source.account))
      ctx.addIssue({
        code: "custom",
        message: "Twilio account must be an Account SID",
      });
  });
export type SpendSource = z.infer<typeof sourceSchema>;
export const sourceUnit = (source: SpendSource) =>
  source.kind === "livekit" ? "minutes" : "USD";
export const sourceId = (source: SpendSource) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        source.key,
        source.kind,
        source.account,
        source.mode ?? "",
        source.url ?? "",
        sourceUnit(source),
      ]),
    )
    .digest("hex");

export function spendSettings(env: NodeJS.ProcessEnv = process.env) {
  if (env.PROVIDER_SPEND_ALERTS_ENABLED !== "true") return null;
  const recipients = [
    ...new Set(
      z
        .array(z.email())
        .min(1)
        .max(50)
        .parse(
          (env.PROVIDER_SPEND_ALERT_RECIPIENTS ?? "")
            .split(",")
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        ),
    ),
  ];
  const sources = z
    .array(sourceSchema)
    .min(1)
    .max(30)
    .parse(JSON.parse(env.PROVIDER_SPEND_MONITORS ?? "[]"));
  if (new Set(sources.map((s) => s.key)).size !== sources.length)
    throw new Error("Spend monitor keys must be unique");
  // Avoid configuring the same bill twice under different display names.
  const accounts = sources.map((s) => `${s.kind}:${s.account}`);
  if (new Set(accounts).size !== accounts.length)
    throw new Error("Spend provider accounts must be unique");
  return { recipients, sources };
}

export function requiredSetting(name: string, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing spend monitor setting: ${name}`);
  return value;
}

// Provider reports can have more than six decimals. Round up once at ingestion.
export function amountMicros(value: unknown): bigint {
  const text =
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value.toFixed(12)
      : typeof value === "string"
        ? value
        : "";
  const match = /^(\d{1,12})(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error("Invalid non-negative provider amount");
  const fraction = match[2] ?? "";
  return (
    parseUsdToMicros(`${match[1]}.${fraction.slice(0, 6).padEnd(6, "0")}`) +
    (/[1-9]/.test(fraction.slice(6)) ? 1n : 0n)
  );
}

export function alertLevel(
  amount: bigint,
  baseline: bigint,
  minimum: bigint,
  dailyCap?: bigint,
) {
  if (dailyCap !== undefined && amount >= dailyCap) return "warning";
  if (amount < minimum) return null;
  if (amount >= baseline * 3n) return "warning";
  return null;
}
