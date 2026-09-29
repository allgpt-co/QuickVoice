# Database call pricing rollout

New wallet calls can use versioned database prices instead of the global US
telephony estimate. Importing a book does not enable it. Default mode is legacy.
Deploy the server and AI reporter changes together; inbound calls need the
reporter's origin, destination, and direction fields.

## What changes

- BillingRateCatalog stores immutable settings, effective/expiry dates, source
  and content hash. TelephonyRate stores indexed origin/destination prefix rows.
- Quick calls and campaign calls pass the actual dialed numbers before dialing.
  Inbound calls resolve rates during worker admission. Rejected inbound legs can
  still have provider connection charges, which remain subject to reconciliation.
- Match the longest destination prefix, then the longest origin prefix or ROW/ALL.
  Rates must match the deployed provider account and product. Unknown routes,
  missing catalog, ambiguous rows, or expired latest prices block new calls in
  enforce mode. There is no fallback to a cheaper country or older expired book.
- The selected rates are frozen in CallBillingSession.rateSnapshot. Rate changes
  and mode changes affect new calls; active and historical calls keep their rates.
- Customer telephony charges are the provider route rate × 1.2, respecting the
  configured provider minimum/increment. Existing provider-final reconciliation
  later applies actual posted call cost × 1.2 and debits/refunds the difference.
- Initial reserve covers 60 seconds plus a 30-second reporting/termination buffer.
  Subsequent reserves cover the greater of that initial estimate or observed AI
  and platform usage extrapolated over the reserve horizon, plus future phone
  and LiveKit usage. Provider minute increments are applied before reserving.
  Reserved money is a hold, not a charge for unused call time.
- Low credit still triggers the existing stop response and physical-call
  termination machinery. This reduces under-reserving; it cannot guarantee zero
  debt after worker/network/provider failures or delayed invoice adjustments.
- Legacy subscriptions continue their existing quota path. Number rentals retain
  their existing provider-quote pricing; these tables price calls.

The shared default catalog and database template use regular Deepgram PAYG
prices for new calls. This also applies in legacy/shadow mode after deploying
the server; it does not require importing Twilio rates. Nova-3 monolingual is $0.0077/audio minute and
multilingual to $0.0092, before the existing 20% AI markup. Aura-2 remains
$0.03/1,000 characters. These are customer list-price bases, not a claim about
your discounted invoice. Optional providerMicrosPerAudioMinute and
providerMicrosPerThousandCharacters can record verified account prices separately;
leave them absent when unknown. Nova-2 remains $0.35/hour (5834 micro-dollars
per minute, rounded up). Existing calls retain their saved catalog snapshots.
[Deepgram pricing](https://deepgram.com/pricing).

## 1. Confirm deployment pricing

Identify the Twilio account and the product actually used by the SIP trunk.
Programmable Voice and Elastic SIP Trunking have different prices. An application
using LiveKit SIP does not establish which Twilio product is on the other side.

The Voice Pricing API returns account-specific current prices for Programmable
Voice. Elastic SIP deployments must use their SIP rate deck/contract, including
origin-dependent destinations and provider billing increments.
[Voice API](https://www.twilio.com/docs/voice/pricing),
[SIP rate downloads](https://www.twilio.com/en-us/sip-trunking/pricing/us).

Confirm the LiveKit project plan and whether the AI worker runs in Coolify/VPS
or LiveKit Cloud. The template supports Ship, Scale and fully self-hosted LiveKit.
Build/Enterprise/custom contracts require explicit reviewed settings rather than
guessing paid unit prices.

LiveKit estimates currently cover configured WebRTC connections, SIP or Twilio
connector transport, and Cloud agent hosting when explicitly selected. VPS
workers cannot include Cloud hosting. SIP and connector cannot both be billed.
Published time increments and minimums are applied. Shared free allowances are
not allocated between customers; customer unit pricing is separate from your
monthly invoice. [Pricing](https://livekit.com/pricing),
[metering](https://docs.livekit.io/deploy/admin/billing/).

The template assumes one agent plus one caller. Review the connection counts for
your project. LiveKit bandwidth, recordings/egress, observability, subscription
fees, and other account-level costs are **not allocated to calls** by this change.
There is no fabricated exact per-call LiveKit invoice reconciliation. Direct
Deepgram calls are charged once, without a second LiveKit Inference line.
Provider-spend monitoring separately tracks available account-level usage.

## 2. Apply migrations and prepare a book

Use the normal deployment migration step. Do not point local tests at production.

```sh
pnpm --filter server exec prisma migrate deploy
```

From a source checkout, use the commands below. In the production server image
replace the executable prefix with:

```sh
node dist/src/modules/billing/rate-book.cli.js
```

Example template for Ship and a worker running in Coolify:

```sh
pnpm --filter server exec tsx src/modules/billing/rate-book.cli.ts template ship vps > /tmp/qv-rates-base.json
```

Use scale instead of ship for Scale; self-hosted only when the LiveKit media
server is self-hosted too. A VPS worker connecting to LiveKit Cloud is still a
Cloud project. Use livekit-cloud instead of vps only for Cloud-hosted workers.

The generated book has no phone routes. Its expiry is 48 hours after generation.
Review the effective time, expiry, model prices, LiveKit meters, markup and
buffer before importing. Use a new catalogVersion and effectiveAt for every
price update. Never extend an existing version's validity in place.

## 3. Add the correct Twilio rates

For Programmable Voice only, the exporter reads existing TWILIO_ACCOUNT_SID and
TWILIO_AUTH_TOKEN from the server environment and imports current_price, not
base_price. This is a read-only provider API call:

```sh
pnpm --filter server exec tsx src/modules/billing/rate-book.cli.ts add-voice-country /tmp/qv-rates-base.json IN > /tmp/qv-rates-india.json
pnpm --filter server exec tsx src/modules/billing/rate-book.cli.ts add-voice-country /tmp/qv-rates-india.json US > /tmp/qv-rates.json
```

This command imports outbound prefixes. Add inbound rows from the correct
country/number-type prices separately. For inbound calls, destinationPrefix is
the called number, not the caller's country. Exact owned-number prefixes avoid
mixing local and toll-free numbers. Include all supported destinations and
origin rules; do not add a universal US-rate fallback.

For Elastic SIP, download the current termination/origination CSV or your
account's negotiated deck. Create a mapping JSON with the actual CSV headers,
account, source URL, and contract billing increments. Example header mapping
(replace these sample headers with your file's headers):

```json
{
  "account": "AC_REPLACE_WITH_YOUR_ACCOUNT",
  "direction": "outbound",
  "currency": "USD",
  "destinationPrefixColumn": "Prefix",
  "priceColumn": "USD",
  "descriptionColumn": "Destination",
  "minimumSeconds": 60,
  "incrementSeconds": 60,
  "source": "https://www.twilio.com/en-us/sip-trunking/pricing/us"
}
```

Set originPrefixColumn when the deck contains origin rules. Without it the
mapping explicitly declares ALL origins. Prefix columns must contain concrete
dialing prefixes, not country names. The importer accepts semicolon/whitespace
separated prefixes, quoted CSV, and decimal USD prices. It rejects malformed,
negative, missing, duplicate, and mixed-product/account prices.

```sh
pnpm --filter server exec tsx src/modules/billing/rate-book.cli.ts add-sip-csv /tmp/qv-rates-base.json /tmp/twilio-deck.csv /tmp/mapping.json > /tmp/qv-rates.json
```

Some origination downloads identify countries and number types rather than
prefixes. Normalize those into explicit owned-number/prefix rows with the
appropriate local/toll-free price before using this importer. Do not infer one
country-wide inbound price. Manually maintained rows use this shape:

```json
{
  "provider": "twilio",
  "account": "AC_REPLACE_WITH_YOUR_ACCOUNT",
  "product": "elastic-sip",
  "direction": "outbound",
  "originPrefix": "ALL",
  "destinationPrefix": "+91",
  "baseMicrosPerMinute": "270000",
  "minimumSeconds": 60,
  "incrementSeconds": 60,
  "description": "EXAMPLE ONLY: replace with verified destination rate",
  "source": "https://www.twilio.com/en-us/sip-trunking/pricing/us"
}
```

The $0.27 rate above is a test example, not a published India quote.

## 4. Validate, quote and import

```sh
pnpm --filter server exec tsx src/modules/billing/rate-book.cli.ts validate /tmp/qv-rates.json
pnpm --filter server exec tsx src/modules/billing/rate-book.cli.ts quote /tmp/qv-rates.json +14155550100 +919466460761 outbound
pnpm --filter server exec tsx src/modules/billing/rate-book.cli.ts import /tmp/qv-rates.json
```

Quote is offline and prints the provider base rate. A provider rate of 270000
micro-dollars/minute produces a customer phone price of 324000 ($0.324).
Validate and quote do not write to the database; import does, atomically.
An identical repeat import is a no-op. Changes under the same version fail.
Credentials do not belong in the book.

## 5. Compare before enabling

On the server deployment, set:

```dotenv
BILLING_PRICING_MODE=shadow
```

Redeploy server and AI. Exercise browser preview, quick outbound, campaign and
inbound calls. Check rateSnapshot.shadowRateCatalog, shadowMinuteMicros and
shadowPricingError in CallBillingSession. New calls use the shared default
catalog during shadow mode, including regular Deepgram prices and the old global
telephony estimates, while the selected proposed database book is stored.

Authenticated users with billing read permission can inspect their organization's
call at GET /api/v1/billing/calls/:callId/cost. It returns AI/platform/phone/LiveKit
components, provider adjustment, shutdown tail, total, and the shadow estimate.
Compare with Twilio posted charges and the LiveKit project's usage.

After verifying the account, product, all supported routes and LiveKit plan:

```dotenv
BILLING_PRICING_MODE=enforce
```

Redeploy the server. New calls now use the database prices. An absent/expired
book prevents new calls; existing sessions still use their frozen snapshots.
The agent configuration's displayed minute estimate uses the browser rate book;
destination-specific telephony is resolved during call admission.

## 6. Keep prices current

An optional operator-controlled HTTPS endpoint can publish the complete validated
JSON book:

```dotenv
BILLING_RATE_BOOK_URL=https://YOUR_CONTROLLED_HOST/quickvoice-rates.json
```

The registered Inngest job refresh-billing-rates fetches it at 02:00 UTC daily
with bounded download size, a timeout and retries. The publisher must refresh
source rates and emit a new version/effective time before expiry. Merely
redownloading an old book does not renew it. This job consumes the published
book; it does not scrape provider pricing pages or independently regenerate SIP
decks. The supplied exporters can run in the publisher's daily job.

Failed downloads/imports leave the previous book untouched. Watch job failures
and impending expiry. Once the latest book expires, enforce mode fails closed.
Automatic rate import is disabled when the URL is unset.

## Verification and rollback

- Test a $0.27 route: customer phone minute is $0.324 and the admission hold
  includes it, AI, platform, LiveKit and buffer.
- Confirm country/prefix overrides, foreign origins, inbound local/toll-free,
  unknown routes, expired versions, and currency/product mismatch rejection.
- Verify depleted-credit calls stop, concurrent calls cannot share reserved
  funds, duplicate usage reports do not double debit, and reconciliation
  preserves the LiveKit component while adjusting phone costs once.
- Browser calls must have no Twilio charge. VPS workers must have no Cloud
  agent-hosting line. Existing snapshots must keep their original prices.
- Check that the 30-second reserve buffer matches deployment reporting and
  termination behavior. Retain the existing duration and silence limits.

For rollback set BILLING_PRICING_MODE=legacy for new calls. This restores the
old global telephony estimate and its under-reserving risk. New calls still use
regular Deepgram prices from the shared default catalog. Do not drop the
tables or column; active sessions and historical reconciliation require them.
No existing customer balances or historical calls are rewritten by migration.
