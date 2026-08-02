import type { TelephonyProvider } from "../../../prisma/generated/prisma/client.js";
import {
  calculateAiUsageCostMicros,
  calculateEstimatedTelephonyChargeMicros,
  calculatePlatformFeeFromMilliseconds,
  getRateCatalog,
  type RateCatalog,
  type AiUsage,
  type TelephonyCatalogProvider,
} from "./rate-catalog.service.js";
import { ceilDiv } from "./money.js";

export type RawModelUsage = Record<
  string,
  string | number | boolean | null | undefined
>;

export type RatedCallUsage = {
  connectedMilliseconds: bigint;
  aiCostMicros: bigint;
  platformCostMicros: bigint;
  telephonyEstimatedMicros: bigint;
  totalCostMicros: bigint;
  normalizedUsage: AiUsage;
};

export function rateCumulativeCallUsage(args: {
  connectedSeconds: number;
  modelUsage: RawModelUsage[];
  telephonyProvider?: TelephonyProvider | null;
  direction?: "inbound" | "outbound";
  rateCatalog?: Readonly<RateCatalog>;
  configuredModels?: {
    sttModel?: string | null;
    llmModel?: string | null;
    ttsModel?: string | null;
  };
}): RatedCallUsage {
  const catalog = args.rateCatalog ?? getRateCatalog();
  const connectedMilliseconds = BigInt(
    Math.max(0, Math.round(args.connectedSeconds * 1_000)),
  );
  const normalizedUsage = normalizeLiveKitModelUsage(
    args.modelUsage,
    args.configuredModels,
  );
  const aiCostMicros = calculateAiUsageCostMicros(normalizedUsage, catalog);
  const platformCostMicros =
    calculatePlatformFeeFromMilliseconds(connectedMilliseconds, catalog);
  const telephonyEstimatedMicros = args.telephonyProvider
      ? calculateEstimatedTelephonyChargeMicros({
        provider: providerCatalogKey(args.telephonyProvider),
        direction: args.direction ?? "outbound",
        // Provider estimates deliberately use whole provider minutes. The
        // asynchronous provider charge replaces this estimate after the call.
        providerBillableMinutes: ceilDiv(connectedMilliseconds, 60_000n),
      }, catalog)
    : 0n;

  return {
    connectedMilliseconds,
    aiCostMicros,
    platformCostMicros,
    telephonyEstimatedMicros,
    totalCostMicros:
      aiCostMicros + platformCostMicros + telephonyEstimatedMicros,
    normalizedUsage,
  };
}

export function estimateConfiguredMinuteMicros(args: {
  sttModel?: string | null;
  llmModel?: string | null;
  ttsModel?: string | null;
  telephonyProvider?: TelephonyProvider | null;
  direction?: "inbound" | "outbound";
}): bigint {
  const catalog = getRateCatalog();
  const sttModel = resolveConfiguredModel(
    catalog.ai.stt,
    args.sttModel,
  );
  const llmModel = resolveConfiguredModel(
    catalog.ai.llm,
    args.llmModel,
  );
  const ttsModel = resolveConfiguredModel(
    catalog.ai.tts,
    args.ttsModel,
  );

  // These are reserve/display assumptions, never the final charge. Actual
  // billing always uses LiveKit's cumulative measured usage.
  const aiEstimate = calculateAiUsageCostMicros({
    stt: [{ modelId: sttModel, audioMilliseconds: 60_000n }],
    llm: [{ modelId: llmModel, inputTokens: 1_500n, outputTokens: 300n }],
    tts: [{ modelId: ttsModel, characters: 900n }],
  }, catalog);
  const telephonyEstimate = args.telephonyProvider
    ? calculateEstimatedTelephonyChargeMicros({
        provider: providerCatalogKey(args.telephonyProvider),
        direction: args.direction ?? "outbound",
        providerBillableMinutes: 1n,
      }, catalog)
    : 0n;

  return (
    aiEstimate +
    calculatePlatformFeeFromMilliseconds(60_000n, catalog) +
    telephonyEstimate
  );
}

export function normalizeLiveKitModelUsage(
  entries: RawModelUsage[],
  configuredModels?: {
    sttModel?: string | null;
    llmModel?: string | null;
    ttsModel?: string | null;
  },
): AiUsage {
  const stt = new Map<string, bigint>();
  const llm = new Map<string, { inputTokens: bigint; outputTokens: bigint }>();
  const tts = new Map<string, bigint>();

  for (const entry of entries) {
    const kind = usageKind(entry);
    const modelId = modelIdentifier(entry, kind, configuredModels);
    if (!kind || !modelId) continue;

    if (kind === "stt") {
      const milliseconds = secondsToMilliseconds(
        numeric(entry.audio_duration ?? entry.audioDuration),
      );
      stt.set(modelId, (stt.get(modelId) ?? 0n) + milliseconds);
      continue;
    }
    if (kind === "llm") {
      const current = llm.get(modelId) ?? {
        inputTokens: 0n,
        outputTokens: 0n,
      };
      current.inputTokens += integer(
        entry.input_tokens ?? entry.inputTokens ?? entry.prompt_tokens,
      );
      current.outputTokens += integer(
        entry.output_tokens ?? entry.outputTokens ?? entry.completion_tokens,
      );
      llm.set(modelId, current);
      continue;
    }
    const characters = integer(
      entry.characters_count ?? entry.charactersCount ?? entry.characters,
    );
    tts.set(modelId, (tts.get(modelId) ?? 0n) + characters);
  }

  return {
    stt: [...stt].map(([modelId, audioMilliseconds]) => ({
      modelId,
      audioMilliseconds,
    })),
    llm: [...llm].map(([modelId, tokens]) => ({ modelId, ...tokens })),
    tts: [...tts].map(([modelId, characters]) => ({ modelId, characters })),
  };
}

export function assertSupportedBillingModels(args: {
  sttModel: string;
  llmModel: string;
  ttsModel: string;
}) {
  const catalog = getRateCatalog();
  resolveConfiguredModel(catalog.ai.stt, args.sttModel);
  resolveConfiguredModel(catalog.ai.llm, args.llmModel);
  resolveConfiguredModel(catalog.ai.tts, args.ttsModel);
}

function usageKind(entry: RawModelUsage): "stt" | "llm" | "tts" | null {
  const type = String(entry.type ?? "").toLowerCase();
  if (type.includes("stt")) return "stt";
  if (type.includes("llm")) return "llm";
  if (type.includes("tts")) return "tts";
  if (entry.characters_count != null || entry.charactersCount != null) {
    return "tts";
  }
  if (entry.input_tokens != null || entry.output_tokens != null) return "llm";
  if (entry.audio_duration != null) return "stt";
  return null;
}

function modelIdentifier(
  entry: RawModelUsage,
  kind: "stt" | "llm" | "tts" | null,
  configuredModels?: {
    sttModel?: string | null;
    llmModel?: string | null;
    ttsModel?: string | null;
  },
): string | null {
  const model = typeof entry.model === "string" ? entry.model.trim() : "";
  if (!model) return null;
  const provider =
    typeof entry.provider === "string" ? entry.provider.trim().toLowerCase() : "";
  const reported =
    !provider || model.includes("/")
      ? model
      : provider === "aws" || provider === "amazon"
        ? `bedrock/${model}`
        : `${provider}/${model}`;
  // Deepgram exposes the multilingual Nova-3 variant to LiveKit as runtime
  // model `nova-3`; the selected billing ID is the only stable signal that the
  // higher multilingual market rate applies.
  const configured =
    kind === "stt"
      ? configuredModels?.sttModel
      : kind === "llm"
        ? configuredModels?.llmModel
        : configuredModels?.ttsModel;
  if (
    configured === "deepgram/nova-3-multilingual" &&
    reported === "deepgram/nova-3"
  ) {
    return configured;
  }
  return reported;
}

function resolveConfiguredModel<T>(
  rates: Record<string, T>,
  configured: string | null | undefined,
): string {
  if (configured && rates[configured]) return configured;
  if (configured) {
    const matches = Object.keys(rates).filter(
      (candidate) => candidate.split("/").at(-1) === configured,
    );
    if (matches.length === 1) return matches[0]!;
    throw new RangeError(
      `Model is not present in the billable rate catalog: ${configured}`,
    );
  }
  const fallback = Object.keys(rates)[0];
  if (!fallback) throw new Error("Billing rate catalog has no configured models");
  return fallback;
}

function providerCatalogKey(
  provider: TelephonyProvider,
): TelephonyCatalogProvider {
  return String(provider).toLowerCase() as TelephonyCatalogProvider;
}

function numeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function integer(value: unknown): bigint {
  return BigInt(Math.max(0, Math.floor(numeric(value))));
}

function secondsToMilliseconds(seconds: number): bigint {
  return BigInt(Math.max(0, Math.round(seconds * 1_000)));
}
