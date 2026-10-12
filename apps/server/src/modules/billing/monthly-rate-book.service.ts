import prisma from "../../config/prisma.js";
import { parseCsv } from "./telephony-reconciliation.service.js";
import { importRateBook, rateBookSchema, type TelephonyRouteRate } from "./database-rate-catalog.service.js";
import { regularRateBookTemplate, sipCsvRates, usdRateMicros } from "./rate-book.cli.js";

const OUTBOUND_URL = "https://assets.cdn.prod.twilio.com/pricing-csv/OutboundSipTrunkPricing.csv";
const INBOUND_URL = "https://assets.cdn.prod.twilio.com/pricing-csv/SiteNumbersPricing.csv";

type OwnedNumber = { number: string; billingCountryIso: string | null; billingNumberType: string | null };

async function downloadCsv(url: string) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error(`Rate download failed: HTTP ${response.status}`);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16 * 1024 * 1024) throw new Error("Rate deck exceeds 16 MiB");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}

const normalizedType = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");

export function buildMonthlyRateBook(args: {
  account: string;
  plan: string;
  workerHosting: string;
  outboundCsv: string;
  inboundCsv: string;
  numbers: OwnedNumber[];
  previousInbound: TelephonyRouteRate[];
  now: Date;
}) {
  const outbound = sipCsvRates(args.outboundCsv, {
    account: args.account, direction: "outbound", currency: "USD",
    destinationPrefixColumn: "Destination Prefixes",
    originPrefixColumn: "Origination Prefixes",
    priceColumn: "Price / min", descriptionColumn: "Description",
    minimumSeconds: 60, incrementSeconds: 60, source: OUTBOUND_URL,
  });
  const [headers, ...rows] = parseCsv(args.inboundCsv.replace(/^\uFEFF/, ""));
  const column = (name: string) => headers?.indexOf(name) ?? -1;
  const iso = column("ISO");
  const type = column("Phone Number Type");
  const price = column("Inbound Trunking Price / min");
  if (iso < 0 || type < 0 || price < 0) throw new Error("Inbound SIP pricing columns are missing");
  const inboundPrices = new Map<string, string[]>();
  for (const row of rows) {
    const value = row[price]?.trim();
    if (!value || value === "N/A") continue;
    const key = `${row[iso]?.trim().toUpperCase()}:${normalizedType(row[type] ?? "")}`;
    inboundPrices.set(key, [...(inboundPrices.get(key) ?? []), usdRateMicros(value)]);
  }
  const knownTypes = new Map(args.previousInbound.map((rate) => {
    const match = /^([A-Z]{2}) (Local|Toll Free) SIP inbound/i.exec(rate.description);
    return [rate.destinationPrefix, match ? [match[1]!.toUpperCase(), normalizedType(match[2]!)] : null] as const;
  }));
  if (!args.numbers.length) throw new Error("No active Twilio numbers to price");
  const inbound: TelephonyRouteRate[] = args.numbers.map((number) => {
    const previous = knownTypes.get(number.number);
    const country = number.billingCountryIso?.toUpperCase() ?? previous?.[0];
    const numberType = number.billingNumberType ? normalizedType(number.billingNumberType) : previous?.[1];
    const prices = inboundPrices.get(`${country}:${numberType}`);
    if (!country || !numberType || prices?.length !== 1)
      throw new Error(`Verified inbound SIP price is missing for ${number.number}`);
    return {
      provider: "twilio", product: "elastic-sip", account: args.account,
      direction: "inbound", originPrefix: "ALL", destinationPrefix: number.number,
      baseMicrosPerMinute: prices[0]!, minimumSeconds: 60, incrementSeconds: 60,
      source: INBOUND_URL, description: `${country} ${numberType.replaceAll("_", " ")} SIP inbound`,
    };
  });
  const template = regularRateBookTemplate(args.plan, args.workerHosting, args.now);
  return rateBookSchema.parse({
    ...template,
    telephony: { twilio: { account: args.account, product: "elastic-sip" } },
    routes: [...outbound, ...inbound],
  });
}

export async function refreshMonthlyRateBook() {
  const account = process.env.TWILIO_ACCOUNT_SID;
  if (!account) throw new Error("TWILIO_ACCOUNT_SID is required for monthly rate refresh");
  const previous = await prisma.billingRateCatalog.findFirst({
    where: { effectiveAt: { lte: new Date() } },
    orderBy: { effectiveAt: "desc" },
  });
  if (!previous) throw new Error("Import an initial reviewed rate book before monthly refresh");
  const settings = previous.settings as unknown as {
    telephony: { twilio?: { account: string; product: string } };
    livekit: { plan: string; workerHosting: string };
    catalog: { priceBasis?: string };
  };
  if (settings.telephony.twilio?.account !== account || settings.telephony.twilio.product !== "elastic-sip")
    throw new Error("Existing SIP rate book does not match the deployed Twilio account");
  if (settings.catalog.priceBasis !== "regular")
    throw new Error("Monthly public rate refresh requires a regular-price catalog");
  const [outboundCsv, inboundCsv, numbers, previousRows] = await Promise.all([
    downloadCsv(OUTBOUND_URL), downloadCsv(INBOUND_URL),
    prisma.phoneNumber.findMany({
      where: { provider: "TWILIO", billingStatus: "ACTIVE" },
      select: { number: true, billingCountryIso: true, billingNumberType: true },
    }),
    prisma.telephonyRate.findMany({
      where: { catalogVersion: previous.version, provider: "twilio", direction: "inbound" },
      select: { rate: true },
    }),
  ]);
  const book = buildMonthlyRateBook({
    account, plan: settings.livekit.plan, workerHosting: settings.livekit.workerHosting,
    outboundCsv, inboundCsv, numbers,
    previousInbound: previousRows.map(({ rate }) => rate as TelephonyRouteRate),
    now: new Date(),
  });
  return importRateBook(book);
}
