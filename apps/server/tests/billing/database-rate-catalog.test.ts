import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  importRateBook,
  MAX_RATE_BOOK_ROUTES,
  getCallAdmissionCatalog,
  rateBookSchema,
  resolveDatabaseCallCatalog,
  selectRouteRate,
  type TelephonyRouteRate,
} from "../../src/modules/billing/database-rate-catalog.service.js";
import {
  regularRateBookTemplate,
  sipCsvRates,
  usdRateMicros,
  voiceCountryRates,
} from "../../src/modules/billing/rate-book.cli.js";
import {
  calculateCallTelephonyMicros,
  calculateLivekitChargeMicros,
  calculateTelephonyChargeMicros,
  getRateCatalog,
  parseRateCatalogSnapshot,
} from "../../src/modules/billing/rate-catalog.service.js";
import {
  estimateConfiguredMinuteMicros,
  rateCumulativeCallUsage,
} from "../../src/modules/billing/call-pricing.service.js";
import { calculateRollingReserveMicros } from "../../src/modules/billing/call-metering.service.js";
import { providerFinalTotalMicros } from "../../src/modules/billing/telephony-reconciliation.service.js";

const now = new Date("2026-09-29T12:00:00Z");
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});
const route: TelephonyRouteRate = {
  provider: "twilio",
  account: "AC-test",
  product: "elastic-sip",
  direction: "outbound",
  originPrefix: "ALL",
  destinationPrefix: "+91",
  baseMicrosPerMinute: "270000",
  minimumSeconds: 60,
  incrementSeconds: 60,
  description: "Synthetic India route",
  source: "https://example.com/rates",
};
function book() {
  return rateBookSchema.parse({
    ...regularRateBookTemplate("ship", "vps", now),
    telephony: { twilio: { account: route.account, product: route.product } },
    routes: [route],
  });
}
function store() {
  const books = new Map<string, any>();
  const routes: any[] = [];
  const db = {
    billingRateCatalog: {
      findUnique: async ({ where }: any) => books.get(where.version) ?? null,
      findFirst: async ({ where }: any) =>
        [...books.values()]
          .filter((b) => b.effectiveAt <= where.effectiveAt.lte)
          .sort((a, b) => b.effectiveAt - a.effectiveAt)[0] ?? null,
      create: async ({ data }: any) => {
        books.set(data.version, data);
        return data;
      },
    },
    telephonyRate: {
      createMany: async ({ data }: any) => {
        routes.push(...data);
        return { count: data.length };
      },
      findMany: async ({ where }: any) =>
        routes.filter(
          (r) =>
            r.catalogVersion === where.catalogVersion &&
            r.provider === where.provider &&
            r.direction === where.direction &&
            where.destinationPrefix.in.includes(r.destinationPrefix),
        ),
    },
    $transaction: async (fn: any) => fn(db),
  };
  return {
    db: db as unknown as Parameters<typeof importRateBook>[1],
    books,
    routes,
  };
}

test("legacy skips the DB, shadow records missing pricing, and enforce refuses missing pricing", async () => {
  let reads = 0;
  const db = {
    billingRateCatalog: {
      findFirst: async () => {
        reads++;
        return null;
      },
    },
  } as unknown as Parameters<typeof importRateBook>[1];
  process.env.BILLING_PRICING_MODE = "legacy";
  assert.equal(
    (await getCallAdmissionCatalog({}, db)).catalog,
    getRateCatalog(),
  );
  assert.equal(reads, 0);
  process.env.BILLING_PRICING_MODE = "shadow";
  const shadow = await getCallAdmissionCatalog({}, db);
  assert.equal(shadow.catalog, getRateCatalog());
  assert.match(shadow.shadowError!, /missing or expired/);
  process.env.BILLING_PRICING_MODE = "enforce";
  await assert.rejects(getCallAdmissionCatalog({}, db), /missing or expired/);
  assert.equal(reads, 2);
});

test("shadow retains the proposed frozen catalog while returning legacy customer prices", async () => {
  const memory = store();
  const template = regularRateBookTemplate(
    "ship",
    "vps",
    new Date(Date.now() - 1000),
  );
  await importRateBook(template, memory.db);
  process.env.BILLING_PRICING_MODE = "shadow";
  const selected = await getCallAdmissionCatalog({}, memory.db);
  assert.equal(
    selected.catalog.catalogVersion,
    getRateCatalog().catalogVersion,
  );
  assert.equal(
    selected.shadowCatalog!.catalogVersion,
    template.catalog.catalogVersion,
  );
  assert.equal(
    selected.shadowCatalog!.ai.stt["deepgram/nova-3"]!.baseMicrosPerAudioMinute,
    "7700",
  );
});

test("regular Deepgram template reuses the shared regular catalog and omits VPS hosting fees", () => {
  const current = book();
  assert.equal(
    current.catalog.ai.stt["deepgram/nova-3"]!.baseMicrosPerAudioMinute,
    "7700",
  );
  assert.equal(
    current.catalog.ai.stt["deepgram/nova-3-multilingual"]!
      .baseMicrosPerAudioMinute,
    "9200",
  );
  assert.equal(
    current.catalog.ai.tts["deepgram/aura-2"]!.baseMicrosPerThousandCharacters,
    "30000",
  );
  assert.equal(
    getRateCatalog().ai.stt["deepgram/nova-3"]!.baseMicrosPerAudioMinute,
    "7700",
  );
  assert.ok(!current.livekit.phone.some((r) => r.meter === "agent-hosting"));
  assert.throws(() => regularRateBookTemplate("unknown", "vps", now));
});

test("destination then origin specificity handles toll-free and ROW without cheaper country fallback", () => {
  const specific = {
    ...route,
    destinationPrefix: "+9194",
    originPrefix: "+1",
    baseMicrosPerMinute: "160000",
  };
  const rest = {
    ...specific,
    originPrefix: "ROW",
    baseMicrosPerMinute: "300000",
  };
  assert.equal(
    selectRouteRate([route, specific, rest], "+14155550100", "+919466460761")
      .baseMicrosPerMinute,
    "160000",
  );
  assert.equal(
    selectRouteRate([route, specific, rest], "+442012345678", "+919466460761")
      .baseMicrosPerMinute,
    "300000",
  );
  assert.throws(
    () => selectRouteRate([route, specific], "+442012345678", "+919466460761"),
    /origin\/destination/,
  );
  assert.throws(
    () => selectRouteRate([route], "+14155550100", "+442012345678"),
    /No rate/,
  );
  assert.throws(
    () => selectRouteRate([route], "14155550100", "+919466460761"),
    /E.164/,
  );
  const inbound = {
    ...route,
    direction: "inbound" as const,
    destinationPrefix: "+1",
    baseMicrosPerMinute: "3400",
  };
  const tollFree = {
    ...inbound,
    destinationPrefix: "+1800",
    baseMicrosPerMinute: "13000",
  };
  assert.equal(
    selectRouteRate([inbound, tollFree], "+14155550100", "+18005550100")
      .baseMicrosPerMinute,
    "13000",
  );
});

test("import is immutable and repeatable; lookups reject wrong account, expired and unavailable rates", async () => {
  const memory = store();
  const original = book();
  assert.equal((await importRateBook(original, memory.db, now)).imported, true);
  assert.equal(
    (await importRateBook(original, memory.db, now)).imported,
    false,
  );
  await assert.rejects(
    importRateBook(
      { ...original, routes: [{ ...route, baseMicrosPerMinute: "1" }] },
      memory.db,
      now,
    ),
    /immutable/,
  );
  process.env.TWILIO_ACCOUNT_SID = "wrong";
  const request = {
    telephonyProvider: "TWILIO",
    direction: "outbound" as const,
    fromNumber: "+14155550100",
    toNumber: "+919466460761",
  };
  await assert.rejects(
    resolveDatabaseCallCatalog(request, now, memory.db),
    /account differs/,
  );
  process.env.TWILIO_ACCOUNT_SID = route.account;
  const catalog = await resolveDatabaseCallCatalog(request, now, memory.db);
  assert.equal(catalog.selectedTelephonyRate!.baseMicrosPerMinute, "270000");
  assert.equal(
    calculateCallTelephonyMicros(
      {
        provider: "twilio",
        direction: "outbound",
        connectedMilliseconds: 60000n,
      },
      catalog,
    ),
    324000n,
  );
  await assert.rejects(
    resolveDatabaseCallCatalog(
      { ...request, toNumber: "+442012345678" },
      now,
      memory.db,
    ),
    /No rate/,
  );
  await assert.rejects(
    resolveDatabaseCallCatalog(request, new Date("2026-10-02"), memory.db),
    /expired/,
  );
  assert.equal(Object.isFrozen(catalog), true);
});

test("validation failures never write partial prices or silently drop currency/account mismatches", async () => {
  const memory = store();
  await assert.rejects(
    importRateBook({ ...book(), routes: [route, route] }, memory.db, now),
    /Duplicate route/,
  );
  await assert.rejects(
    importRateBook(
      { ...book(), catalog: { ...book().catalog, currency: "INR" } },
      memory.db,
      now,
    ),
  );
  await assert.rejects(
    importRateBook(
      { ...book(), routes: [{ ...route, account: "other" }] },
      memory.db,
      now,
    ),
    /account\/product/,
  );
  await assert.rejects(
    importRateBook(
      { ...book(), expiresAt: "2026-09-28T00:00:00Z" },
      memory.db,
      now,
    ),
  );
  assert.equal(memory.books.size, 0);
  assert.equal(memory.routes.length, 0);
});

test("frozen calls survive a new catalog version and browser sessions have no Twilio charge", async () => {
  const memory = store();
  const old = book();
  await importRateBook(old, memory.db, now);
  process.env.TWILIO_ACCOUNT_SID = route.account;
  const selected = await resolveDatabaseCallCatalog(
    {
      telephonyProvider: "TWILIO",
      fromNumber: "+14155550100",
      toNumber: "+919466460761",
    },
    now,
    memory.db,
  );
  const nextTime = new Date(now.getTime() + 1000);
  await importRateBook(
    {
      ...old,
      catalog: {
        ...old.catalog,
        catalogVersion: "next",
        effectiveAt: nextTime.toISOString(),
      },
      routes: [{ ...route, baseMicrosPerMinute: "400000" }],
    },
    memory.db,
    nextTime,
  );
  const frozen = parseRateCatalogSnapshot(JSON.parse(JSON.stringify(selected)));
  assert.equal(frozen.selectedTelephonyRate!.baseMicrosPerMinute, "270000");
  const browser = await resolveDatabaseCallCatalog({}, nextTime, memory.db);
  const usage = rateCumulativeCallUsage({
    connectedSeconds: 60,
    modelUsage: [],
    rateCatalog: browser,
  });
  assert.equal(usage.telephonyEstimatedMicros, 0n);
  assert.equal(usage.livekitEstimatedMicros, 1200n);
  assert.equal(usage.totalCostMicros, 11200n);
  assert.ok(
    estimateConfiguredMinuteMicros({ rateCatalog: browser }) >
      estimateConfiguredMinuteMicros({}),
  );
});

test("LiveKit time billing observes the ten-second minimum; self-hosted has no Cloud charge", () => {
  const template = book();
  const catalog = parseRateCatalogSnapshot({
    ...template.catalog,
    livekit: {
      ...template.livekit,
      rates: template.livekit.phone,
      estimated: true,
    },
  });
  assert.equal(calculateLivekitChargeMicros(0n, catalog), 0n);
  assert.equal(calculateLivekitChargeMicros(1000n, catalog), 902n);
  assert.equal(calculateLivekitChargeMicros(60000n, catalog), 5400n);
  const selfHosted = rateBookSchema.parse(
    regularRateBookTemplate("self-hosted", "vps", now),
  );
  assert.deepEqual(selfHosted.livekit.phone, []);
  const duplicate = {
    ...template.livekit,
    phone: [
      ...template.livekit.phone,
      { ...template.livekit.phone[1], meter: "twilio-connector" },
    ],
  };
  assert.throws(
    () => rateBookSchema.parse({ ...template, livekit: duplicate }),
    /alternative transports/,
  );
});

test("expensive telephony, billing increments and final reconciliation use the same 20% markup", () => {
  const catalog = parseRateCatalogSnapshot({
    ...book().catalog,
    selectedTelephonyRate: route,
  });
  const args = { provider: "twilio" as const, direction: "outbound" as const };
  assert.equal(
    calculateCallTelephonyMicros(
      { ...args, connectedMilliseconds: 1n },
      catalog,
    ),
    324000n,
  );
  assert.equal(
    calculateCallTelephonyMicros(
      { ...args, connectedMilliseconds: 60001n },
      catalog,
    ),
    648000n,
  );
  assert.equal(calculateTelephonyChargeMicros(2700000n, catalog), 3240000n);
  assert.throws(
    () =>
      calculateCallTelephonyMicros(
        { ...args, direction: "inbound", connectedMilliseconds: 60000n },
        catalog,
      ),
    /conflicts/,
  );
});

test("rolling reserve adds future infrastructure to observed AI usage, including shutdown buffer", () => {
  assert.equal(
    calculateRollingReserveMicros({
      configuredReserveMicros: 700000n,
      priorConnectedMilliseconds: 0n,
      connectedMilliseconds: 10000n,
      priorAiAndPlatformMicros: 0n,
      aiAndPlatformMicros: 100000n,
      horizonMilliseconds: 90000n,
      infrastructureReserveMicros: 653400n,
    }),
    1553400n,
  );
});

test("provider reconciliation replaces only telephony, retaining LiveKit and shutdown-tail charges", () => {
  assert.equal(
    providerFinalTotalMicros(
      {
        aiCostMicros: 417600n,
        platformCostMicros: 100000n,
        livekitEstimatedMicros: 54000n,
        unreportedTailMicros: 1000n,
      },
      3240000n,
    ),
    3812600n,
  );
});

test("SIP deck mapping validates columns, decimal precision and product without guessing Voice prices", () => {
  const mapping = {
    account: route.account,
    direction: "outbound",
    currency: "USD",
    destinationPrefixColumn: "Prefix",
    priceColumn: "USD",
    descriptionColumn: "Destination",
    minimumSeconds: 60,
    incrementSeconds: 60,
    source: route.source,
  };
  const rates = sipCsvRates(
    'Prefix,USD,Destination\n91,0.27,"India, mobile"\n44,0.1600001,UK',
    mapping,
  );
  assert.equal(rates[0]!.product, "elastic-sip");
  assert.equal(rates[0]!.baseMicrosPerMinute, "270000");
  assert.equal(rates[1]!.baseMicrosPerMinute, "160001");
  assert.throws(
    () => sipCsvRates("Prefix,USD,Destination\n91,-0.27,India", mapping),
    /nonnegative/,
  );
  assert.throws(() => sipCsvRates("Prefix,USD\n91,0.27", mapping), /Missing/);
  assert.throws(
    () => sipCsvRates("Prefix,USD,Destination\n91,,India", mapping),
    /decimal/,
  );
  assert.throws(() => usdRateMicros("NaN"));
});

test("SIP decks expand comma-separated origins and destinations, with blank origins covering ALL", () => {
  const mapping = {
    account: route.account,
    direction: "outbound",
    currency: "USD",
    destinationPrefixColumn: "Prefix",
    originPrefixColumn: "Origin",
    priceColumn: "USD",
    descriptionColumn: "Destination",
    minimumSeconds: 60,
    incrementSeconds: 60,
    source: route.source,
  };
  const rates = sipCsvRates(
    'Prefix,Origin,USD,Destination\n"91, 92",,0.27,Default\n"91;92","30, 31",0.16,Regional',
    mapping,
  );
  assert.equal(rates.length, 6);
  assert.equal(selectRouteRate(rates, "+14155550100", "+919876543210").baseMicrosPerMinute, "270000");
  assert.equal(selectRouteRate(rates, "+30123456789", "+919876543210").baseMicrosPerMinute, "160000");
  assert.throws(() => sipCsvRates("Prefix,Origin,USD,Destination\n,ALL,0.27,Invalid", mapping));
  const prefixes = Array.from({ length: 501 }, (_, i) => String(1000 + i)).join(",");
  assert.throws(
    () => sipCsvRates(`Prefix,Origin,USD,Destination\n"${prefixes}","${prefixes}",0.27,TooBig`, mapping),
    /expanded routes/,
  );
  // Worldwide origin-dependent decks exceed 100k rows; keep validation bounded.
  const largeBook = {
    ...book(),
    routes: Array.from({ length: 182_950 }, (_, i) => ({
      ...route,
      destinationPrefix: `+${1000000 + i}`,
    })),
  };
  assert.equal(rateBookSchema.parse(largeBook).routes.length, 182_950);
  assert.throws(() => rateBookSchema.parse({
    ...book(), routes: Array(MAX_RATE_BOOK_ROUTES + 1).fill(route),
  }));
});

test("Twilio Voice imports account current price instead of retail base price", () => {
  const rates = voiceCountryRates(
    {
      iso_country: "IN",
      price_unit: "USD",
      outbound_prefix_prices: [
        {
          destination_prefixes: ["91"],
          origination_prefixes: ["ALL"],
          current_price: "0.27",
          base_price: "0.30",
        },
      ],
    },
    route.account,
  );
  assert.equal(rates[0]!.baseMicrosPerMinute, "270000");
  assert.equal(rates[0]!.product, "programmable-voice");
  assert.throws(() =>
    voiceCountryRates(
      { iso_country: "IN", price_unit: "INR", outbound_prefix_prices: [] },
      route.account,
    ),
  );
});
