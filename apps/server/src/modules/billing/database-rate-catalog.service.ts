import { createHash } from "node:crypto";
import { z } from "zod";
import prisma from "../../config/prisma.js";
import {
  getRateCatalog,
  livekitRateSchema,
  parseRateCatalogSnapshot,
  telephonyRouteSchema,
  type RateCatalog,
} from "./rate-catalog.service.js";

export class PricingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingUnavailableError";
  }
}

const providerConfig = z
  .object({
    account: z.string().min(1),
    product: z.enum(["programmable-voice", "elastic-sip", "sip-trunking"]),
  })
  .strict();

export const rateBookSchema = z
  .object({
    catalog: z.unknown().transform((value) => parseRateCatalogSnapshot(value)),
    expiresAt: z.string().datetime(),
    source: z.string().url(),
    telephony: z
      .object({
        twilio: providerConfig.optional(),
        telnyx: providerConfig.optional(),
      })
      .strict(),
    livekit: z
      .object({
        plan: z.string().min(1),
        hosting: z.enum(["cloud", "self-hosted"]),
        workerHosting: z.enum(["vps", "livekit-cloud"]),
        markupBasisPoints: z.literal(2000),
        source: z.string().url(),
        browser: z.array(livekitRateSchema).max(4),
        phone: z.array(livekitRateSchema).max(4),
      })
      .strict(),
    routes: z.array(telephonyRouteSchema).max(100_000),
  })
  .strict()
  .superRefine((book, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (new Date(book.expiresAt) <= new Date(book.catalog.effectiveAt))
      invalid("Rate book expires before it becomes effective");
    if (book.catalog.selectedTelephonyRate || book.catalog.livekit)
      invalid("Import the catalog without per-call selections");
    if (book.catalog.markupBasisPoints.telephony !== 2000)
      invalid("Telephony markup must be 20%");
    if (!book.catalog.priceBasis)
      invalid("Declare regular or account AI price basis");
    if (book.catalog.reserveBufferSeconds === undefined)
      invalid("Declare the reporting/hangup reserve buffer");
    const keys = new Set<string>();
    for (const route of book.routes) {
      const config = book.telephony[route.provider];
      if (
        !config ||
        config.account !== route.account ||
        config.product !== route.product
      )
        invalid("Route account/product does not match the rate book");
      const key = JSON.stringify([
        route.provider,
        route.direction,
        route.originPrefix,
        route.destinationPrefix,
      ]);
      if (keys.has(key)) invalid(`Duplicate route: ${key}`);
      keys.add(key);
    }
    for (const [provider, config] of Object.entries(book.telephony)) {
      if (config && !book.routes.some((rate) => rate.provider === provider))
        invalid(`No routes for ${provider}`);
    }
    for (const kind of ["browser", "phone"] as const) {
      const rates = book.livekit[kind];
      const meters = rates.map((rate) => rate.meter);
      if (new Set(meters).size !== meters.length)
        invalid("Duplicate LiveKit meter");
      if (meters.includes("sip") && meters.includes("twilio-connector"))
        invalid("SIP and Twilio connector are alternative transports");
      if (
        kind === "browser" &&
        meters.some((m) => m === "sip" || m === "twilio-connector")
      )
        invalid("Browser calls cannot include telephony transport");
      if (
        book.livekit.workerHosting === "vps" &&
        meters.includes("agent-hosting")
      )
        invalid("VPS workers do not incur LiveKit agent hosting");
      if (book.livekit.hosting === "self-hosted" && rates.length)
        invalid("Self-hosted LiveKit has no Cloud meters");
      if (book.livekit.hosting === "cloud" && !meters.includes("webrtc"))
        invalid("Configure Cloud WebRTC connection pricing explicitly");
      if (
        book.livekit.hosting === "cloud" &&
        kind === "phone" &&
        !meters.includes("sip") &&
        !meters.includes("twilio-connector")
      )
        invalid("Configure Cloud phone transport pricing explicitly");
      if (
        book.livekit.workerHosting === "livekit-cloud" &&
        !meters.includes("agent-hosting")
      )
        invalid("Configure Cloud agent hosting pricing explicitly");
    }
  });

export type RateBook = z.infer<typeof rateBookSchema>;
export type TelephonyRouteRate = z.infer<typeof telephonyRouteSchema>;
export type PricingRoute = {
  telephonyProvider?: string | null;
  direction?: "inbound" | "outbound";
  fromNumber?: string | null;
  toNumber?: string | null;
};

export function pricingMode() {
  return z
    .enum(["legacy", "shadow", "enforce"])
    .parse(process.env.BILLING_PRICING_MODE ?? "legacy");
}

export function selectRouteRate(
  rates: TelephonyRouteRate[],
  fromNumber: string,
  toNumber: string,
) {
  const e164 = /^\+[1-9]\d{1,14}$/;
  if (!e164.test(fromNumber) || !e164.test(toNumber))
    throw new PricingUnavailableError(
      "Pricing requires E.164 origin and destination",
    );
  const destinations = rates.filter((rate) =>
    toNumber.startsWith(rate.destinationPrefix),
  );
  if (!destinations.length)
    throw new PricingUnavailableError("No rate for this destination");
  // Choose the destination first. A ROW rate excludes explicit origins for
  // that destination; a broader country rate must never override it.
  const longest = Math.max(
    ...destinations.map((rate) => rate.destinationPrefix.length),
  );
  const candidates = destinations.filter(
    (rate) => rate.destinationPrefix.length === longest,
  );
  const explicit = candidates.filter(
    (rate) =>
      rate.originPrefix.startsWith("+") &&
      fromNumber.startsWith(rate.originPrefix),
  );
  const matching = explicit.length
    ? explicit
    : candidates.filter(
        (rate) => rate.originPrefix === "ROW" || rate.originPrefix === "ALL",
      );
  matching.sort((a, b) => b.originPrefix.length - a.originPrefix.length);
  if (!matching.length)
    throw new PricingUnavailableError(
      "No rate for this origin/destination pair",
    );
  if (
    matching[1] &&
    matching[1].originPrefix.length === matching[0]!.originPrefix.length
  )
    throw new PricingUnavailableError("Ambiguous telephony rates");
  return matching[0]!;
}

export async function resolveDatabaseCallCatalog(
  route: PricingRoute,
  now = new Date(),
  db = prisma,
): Promise<Readonly<RateCatalog>> {
  const book = await db.billingRateCatalog.findFirst({
    where: { effectiveAt: { lte: now } },
    orderBy: { effectiveAt: "desc" },
  });
  if (!book || book.expiresAt <= now)
    throw new PricingUnavailableError(
      "Billing rate catalog is missing or expired",
    );
  const settings = book.settings as unknown as Omit<RateBook, "routes">;
  const catalog = parseRateCatalogSnapshot(settings.catalog);
  let selectedTelephonyRate: TelephonyRouteRate | undefined;
  if (route.telephonyProvider) {
    const provider = route.telephonyProvider.toLowerCase();
    if (provider !== "twilio" && provider !== "telnyx")
      throw new PricingUnavailableError("Unknown telephony provider");
    const config = settings.telephony[provider];
    if (!config || !route.toNumber || !route.fromNumber)
      throw new PricingUnavailableError("Telephony route is not configured");
    if (
      provider === "twilio" &&
      config.account !== process.env.TWILIO_ACCOUNT_SID
    )
      throw new PricingUnavailableError(
        "Twilio pricing account differs from the calling account",
      );
    const prefixes = Array.from({ length: route.toNumber.length - 1 }, (_, i) =>
      route.toNumber!.slice(0, i + 2),
    );
    const rows = await db.telephonyRate.findMany({
      where: {
        catalogVersion: book.version,
        provider,
        direction: route.direction ?? "outbound",
        destinationPrefix: { in: prefixes },
      },
    });
    selectedTelephonyRate = selectRouteRate(
      rows.map((row) => telephonyRouteSchema.parse(row.rate)),
      route.fromNumber,
      route.toNumber,
    );
  }
  return parseRateCatalogSnapshot({
    ...catalog,
    selectedTelephonyRate,
    livekit: {
      plan: settings.livekit.plan,
      markupBasisPoints: settings.livekit.markupBasisPoints,
      source: settings.livekit.source,
      estimated: true,
      rates: route.telephonyProvider
        ? settings.livekit.phone
        : settings.livekit.browser,
    },
  });
}

export async function getCallAdmissionCatalog(
  route: PricingRoute,
  db = prisma,
) {
  const mode = pricingMode();
  if (mode === "legacy") return { catalog: getRateCatalog() };
  try {
    const catalog = await resolveDatabaseCallCatalog(route, new Date(), db);
    return mode === "enforce"
      ? { catalog }
      : { catalog: getRateCatalog(), shadowCatalog: catalog };
  } catch (error) {
    if (mode === "enforce") throw error;
    // Shadow mode records the absence without altering wallet authorization.
    return {
      catalog: getRateCatalog(),
      shadowError:
        error instanceof PricingUnavailableError
          ? error.message
          : "Pricing lookup failed",
    };
  }
}

export async function importRateBook(
  value: unknown,
  db = prisma,
  now = new Date(),
) {
  const book = rateBookSchema.parse(value);
  if (new Date(book.expiresAt) <= now)
    throw new PricingUnavailableError("Cannot import an expired rate book");
  const hash = createHash("sha256").update(JSON.stringify(book)).digest("hex");
  const { routes, ...settings } = book;
  return db.$transaction(
    async (tx) => {
      const existing = await tx.billingRateCatalog.findUnique({
        where: { version: book.catalog.catalogVersion },
      });
      if (existing) {
        if (existing.contentHash !== hash)
          throw new Error("Rate versions are immutable; import a new version");
        return {
          version: existing.version,
          imported: false,
          routes: routes.length,
        };
      }
      await tx.billingRateCatalog.create({
        data: {
          version: book.catalog.catalogVersion,
          effectiveAt: new Date(book.catalog.effectiveAt),
          expiresAt: new Date(book.expiresAt),
          contentHash: hash,
          settings,
        },
      });
      // Bound SQL parameter counts for worldwide prefix decks.
      for (let i = 0; i < routes.length; i += 1000) {
        await tx.telephonyRate.createMany({
          data: routes.slice(i, i + 1000).map((rate) => ({
            catalogVersion: book.catalog.catalogVersion,
            provider: rate.provider,
            direction: rate.direction,
            originPrefix: rate.originPrefix,
            destinationPrefix: rate.destinationPrefix,
            rate,
          })),
        });
      }
      return {
        version: book.catalog.catalogVersion,
        imported: true,
        routes: routes.length,
      };
    },
    { timeout: 60_000 },
  );
}

export async function refreshRateBook() {
  const endpoint = process.env.BILLING_RATE_BOOK_URL;
  if (!endpoint) return { skipped: true };
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Rate book URL must use HTTPS without credentials");
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Rate book download failed: HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty rate book response");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 50 * 1024 * 1024) throw new Error("Rate book exceeds 50 MiB");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return importRateBook(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
