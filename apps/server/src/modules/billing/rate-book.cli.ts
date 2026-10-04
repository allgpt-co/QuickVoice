import "dotenv/config";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import prisma from "../../config/prisma.js";
import {
  getRateCatalog,
  telephonyRouteSchema,
} from "./rate-catalog.service.js";
import {
  importRateBook,
  MAX_RATE_BOOK_ROUTES,
  rateBookSchema,
  selectRouteRate,
  type RateBook,
  type TelephonyRouteRate,
} from "./database-rate-catalog.service.js";
import { parseCsv } from "./telephony-reconciliation.service.js";

export function regularRateBookTemplate(
  plan: string,
  workerHosting: string,
  now = new Date(),
) {
  z.enum(["ship", "scale", "self-hosted"]).parse(plan);
  z.enum(["vps", "livekit-cloud"]).parse(workerHosting);
  const catalog = {
    ...structuredClone(getRateCatalog()),
    catalogVersion: `regular-${now.toISOString()}`,
    effectiveAt: now.toISOString(),
    priceBasis: "regular" as const,
    reserveBufferSeconds: 30,
  };
  const timed = (
    meter: "webrtc" | "sip" | "agent-hosting",
    baseMicrosPerMinute: string,
    units = 1,
  ) => ({
    meter,
    baseMicrosPerMinute,
    units,
    minimumSeconds: 10,
    incrementSeconds: 1,
  });
  const hosting =
    workerHosting === "livekit-cloud" ? [timed("agent-hosting", "10000")] : [];
  return {
    catalog,
    expiresAt: new Date(now.getTime() + 48 * 3600_000).toISOString(),
    source: "https://deepgram.com/pricing",
    telephony: {},
    routes: [],
    livekit: {
      plan,
      hosting: plan === "self-hosted" ? "self-hosted" : "cloud",
      workerHosting,
      markupBasisPoints: 2000,
      source: "https://livekit.com/pricing",
      // One agent and one browser; phone transport replaces the browser connection.
      // ponytail: fixed one-agent/one-caller topology estimates connection time.
      // Multi-participant/reconnect billing needs per-connection export data.
      browser:
        plan === "self-hosted"
          ? []
          : [timed("webrtc", plan === "scale" ? "400" : "500", 2), ...hosting],
      phone:
        plan === "self-hosted"
          ? []
          : [
              timed("webrtc", plan === "scale" ? "400" : "500"),
              timed("sip", plan === "scale" ? "3000" : "4000"),
              ...hosting,
            ],
    },
  };
}

export function usdRateMicros(value: unknown) {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,12})?$/.test(value))
    throw new Error("Provider rate must be a nonnegative decimal USD string");
  const [whole, fractional = ""] = value.split(".");
  return (
    BigInt(whole!) * 1_000_000n +
    BigInt(fractional.padEnd(6, "0").slice(0, 6)) +
    (/[1-9]/.test(fractional.slice(6)) ? 1n : 0n)
  ).toString();
}

const sipMappingSchema = z
  .object({
    account: z.string().min(1),
    direction: z.enum(["inbound", "outbound"]),
    currency: z.literal("USD"),
    destinationPrefixColumn: z.string().min(1),
    priceColumn: z.string().min(1),
    descriptionColumn: z.string().min(1),
    originPrefixColumn: z.string().optional(),
    minimumSeconds: z.number().int().min(0).max(3600),
    incrementSeconds: z.number().int().min(1).max(3600),
    source: z.string().url(),
  })
  .strict();

export function sipCsvRates(
  csv: string,
  rawMapping: unknown,
): TelephonyRouteRate[] {
  const mapping = sipMappingSchema.parse(rawMapping);
  const [headers, ...rows] = parseCsv(csv.replace(/^\uFEFF/, ""));
  if (!headers || !rows.length) throw new Error("Empty SIP rate deck");
  const column = (name: string) => {
    const index = headers.indexOf(name);
    if (index < 0 || headers.lastIndexOf(name) !== index)
      throw new Error(`Missing or duplicate CSV column: ${name}`);
    return index;
  };
  const destination = column(mapping.destinationPrefixColumn);
  const price = column(mapping.priceColumn);
  const description = column(mapping.descriptionColumn);
  const origin = mapping.originPrefixColumn
    ? column(mapping.originPrefixColumn)
    : -1;
  const prefix = (raw: string) =>
    raw.startsWith("+") || raw === "ALL" || raw === "ROW" ? raw : `+${raw}`;
  let expandedRows = 0;
  return rows.flatMap((row) => {
    if (row.length !== headers.length)
      throw new Error("SIP CSV row has an unexpected column count");
    const rawOrigin = origin < 0 ? "" : row[origin]!.trim();
    const origins = rawOrigin ? rawOrigin.split(/[,;\s]+/) : ["ALL"];
    const destinations = row[destination]!.trim().split(/[,;\s]+/);
    expandedRows += origins.length * destinations.length;
    if (expandedRows > MAX_RATE_BOOK_ROUTES)
      throw new Error(`SIP deck exceeds ${MAX_RATE_BOOK_ROUTES} expanded routes`);
    return destinations.flatMap((to) =>
      origins.map((from) =>
        telephonyRouteSchema.parse({
          provider: "twilio",
          product: "elastic-sip",
          account: mapping.account,
          direction: mapping.direction,
          destinationPrefix: prefix(to),
          originPrefix: prefix(from),
          baseMicrosPerMinute: usdRateMicros(row[price]!.trim()),
          minimumSeconds: mapping.minimumSeconds,
          incrementSeconds: mapping.incrementSeconds,
          source: mapping.source,
          description: row[description]!.trim(),
        }),
      ),
    );
  });
}

export function voiceCountryRates(
  value: unknown,
  account: string,
): TelephonyRouteRate[] {
  const response = z
    .object({
      price_unit: z
        .string()
        .refine(
          (value) => value.toUpperCase() === "USD",
          "USD prices required",
        ),
      outbound_prefix_prices: z
        .array(
          z.object({
            destination_prefixes: z.array(z.string()).min(1),
            origination_prefixes: z.array(z.string()).min(1),
            current_price: z.string(),
            friendly_name: z.string().optional(),
          }),
        )
        .min(1),
      iso_country: z.string().regex(/^[A-Z]{2}$/),
    })
    .parse(value);
  const prefix = (raw: string) =>
    raw === "ALL" || raw === "ROW" || raw.startsWith("+") ? raw : `+${raw}`;
  return response.outbound_prefix_prices.flatMap((rate) =>
    rate.destination_prefixes.flatMap((to) =>
      rate.origination_prefixes.map((from) =>
        telephonyRouteSchema.parse({
          provider: "twilio",
          product: "programmable-voice",
          account,
          direction: "outbound",
          destinationPrefix: prefix(to),
          originPrefix: prefix(from),
          baseMicrosPerMinute: usdRateMicros(rate.current_price),
          minimumSeconds: 60,
          incrementSeconds: 60,
          source: `https://pricing.twilio.com/v2/Voice/Countries/${response.iso_country}`,
          description: rate.friendly_name ?? response.iso_country,
        }),
      ),
    ),
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const readJson = async (path: string | undefined) => {
    if (!path) throw new Error("An input JSON path is required");
    return JSON.parse(await readFile(path, "utf8"));
  };
  if (command === "template")
    return regularRateBookTemplate(args[0]!, args[1]!);
  if (command === "validate") {
    const book = rateBookSchema.parse(await readJson(args[0]));
    return {
      version: book.catalog.catalogVersion,
      routes: book.routes.length,
      valid: true,
    };
  }
  if (command === "import") return importRateBook(await readJson(args[0]));
  if (command === "quote") {
    const book = rateBookSchema.parse(await readJson(args[0]));
    const [from, to, direction = "outbound"] = args.slice(1);
    return selectRouteRate(
      book.routes.filter(
        (r) => r.provider === "twilio" && r.direction === direction,
      ),
      from!,
      to!,
    );
  }
  if (command === "add-sip-csv" || command === "add-voice-country") {
    const book = (await readJson(args[0])) as RateBook;
    let rates: TelephonyRouteRate[];
    if (command === "add-sip-csv") {
      if (!args[1]) throw new Error("A CSV path is required");
      rates = sipCsvRates(
        await readFile(args[1], "utf8"),
        await readJson(args[2]),
      );
    } else {
      const country = z
        .string()
        .regex(/^[A-Z]{2}$/)
        .parse(args[1]);
      const account = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      if (!account || !token)
        throw new Error("Twilio account credentials are missing");
      const response = await fetch(
        `https://pricing.twilio.com/v2/Voice/Countries/${country}`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${account}:${token}`).toString("base64")}`,
          },
          signal: AbortSignal.timeout(15_000),
          redirect: "error",
        },
      );
      if (!response.ok)
        throw new Error(`Twilio pricing returned HTTP ${response.status}`);
      rates = voiceCountryRates(await response.json(), account);
    }
    const config = book.telephony.twilio;
    if (
      config &&
      (config.account !== rates[0]!.account ||
        config.product !== rates[0]!.product)
    )
      throw new Error("Cannot combine pricing products or accounts");
    book.telephony.twilio = {
      account: rates[0]!.account,
      product: rates[0]!.product,
    };
    book.routes = book.routes.concat(rates);
    return rateBookSchema.parse(book);
  }
  throw new Error(
    "Usage: billing:rates template <ship|scale|self-hosted> <vps|livekit-cloud> | validate <book.json> | import <book.json> | quote <book.json> <from> <to> [inbound|outbound] | add-sip-csv <book.json> <deck.csv> <mapping.json> | add-voice-country <book.json> <CC>",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : "Rate import failed",
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
