# Stripe Wallet Test-Mode Verification

Use this guide to verify QuickVoice's organization-level prepaid wallet against a Stripe sandbox. It covers the wallet webhook only; it does not validate live payments, production tax settings, or legacy subscription migration.

> **Never commit secrets.** Use only `sk_test_...` and `pk_test_...` keys here. Keep keys and every `whsec_...` value in the ignored local env files. Never paste them into issues, test output, screenshots, or committed documentation.

## Prerequisites

- Complete the repository [Quick Start](../../README.md#quick-start), including Docker, Node, pnpm, and Go Task.
- Install the [Stripe CLI](https://docs.stripe.com/stripe-cli), run `stripe login`, and select the same Stripe sandbox that owns the test API keys.
- Use a new or disposable QuickVoice organization whose owner or admin can manage billing. A fresh wallet makes balance and refund assertions easier.
- Keep Stripe Automatic Tax disabled for this smoke test. Tax-enabled verification requires a reviewed `STRIPE_WALLET_TAX_CODE` and is a separate release check.

## Configure local test mode

Create the ignored env files first:

```sh
task env:dev
```

Set these values in `apps/server/.env.dev`:

```dotenv
QUICKVOICE_BILLING_MODE=hosted
STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_SANDBOX_SECRET_KEY

# Reserved for Better Auth's legacy subscription webhook. Do not reuse the
# wallet listener's secret here.
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_WITH_LEGACY_ENDPOINT_SECRET

# Replace this after starting `stripe listen` below. This is the dedicated
# signing secret for POST /api/v1/billing/stripe/webhook.
STRIPE_WALLET_WEBHOOK_SECRET=whsec_REPLACE_WITH_WALLET_LISTENER_SECRET

STRIPE_AUTOMATIC_TAX_ENABLED=false
STRIPE_WALLET_TAX_CODE=
```

Set the matching sandbox publishable key in `apps/console/.env.local`:

```dotenv
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_REPLACE_WITH_SANDBOX_PUBLISHABLE_KEY
```

The secret and publishable keys must belong to the same Stripe sandbox. `STRIPE_WEBHOOK_SECRET` and `STRIPE_WALLET_WEBHOOK_SECRET` must remain different: the first belongs to Better Auth's legacy subscription listener, while the second verifies prepaid-wallet events at the dedicated raw-body endpoint.

Prepare the local database and dependencies:

```sh
task deps
task docker:up
task db:migrate
```

## Forward wallet events

In a dedicated terminal, forward only the wallet event set:

```sh
stripe listen \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,payment_intent.succeeded,payment_intent.payment_failed,setup_intent.succeeded,charge.refunded,charge.dispute.created,charge.dispute.closed \
  --forward-to http://localhost:5000/api/v1/billing/stripe/webhook
```

Copy the `whsec_...` value printed by `stripe listen` into `STRIPE_WALLET_WEBHOOK_SECRET` in `apps/server/.env.dev`. Do not put it in `STRIPE_WEBHOOK_SECRET`. Keep the listener running, then start or restart the API and console in separate terminals:

```sh
task server:dev
```

```sh
task console:dev
```

The exact wallet endpoint is:

```text
POST http://localhost:5000/api/v1/billing/stripe/webhook
```

It is intentionally sessionless and signature-protected. An unsigned request should fail rather than process an event:

```sh
curl -i -X POST http://localhost:5000/api/v1/billing/stripe/webhook \
  -H 'content-type: application/json' \
  --data '{}'
```

Expect `400`, then use the real Stripe flow below. A generic `stripe trigger checkout.session.completed` can exercise delivery, but its fixture has no QuickVoice organization or top-up metadata and therefore cannot prove wallet crediting.

## Run the console smoke test

1. Open `http://localhost:3000/settings/billing`, sign in, and select the disposable organization. The page must show **Prepaid wallet**, not **Self-hosted · unmetered**.
2. Under **Add credit**, choose `$5`, click **Add $5**, and complete embedded Checkout with Stripe's standard test card `4242 4242 4242 4242`, any future expiration date, any three-digit CVC, and any postal code.
3. Keep the Stripe listener running. It must show a successful `checkout.session.completed` delivery to the wallet endpoint. Treat the webhook as authoritative; the Checkout completion callback alone must not credit the wallet.
4. Allow up to 30 seconds for the billing page to refresh. Confirm **Paid credit** increased by exactly `$5.00` and a single **Wallet top-up** transaction appeared. Promotional credit can make **Available balance** larger than `$5.00`.
5. Under **Payment method**, click **Add card** or **Replace**, submit the same test card, and wait for `setup_intent.succeeded`. Confirm the saved card summary appears after the bounded refresh or a page reload.
6. Enable **Automatic recharge**, set **Threshold** to `$5` and **Recharge amount** to `$20`, then click **Save auto-recharge**. Reload the page and confirm all three settings persisted. This verifies configuration; an actual automatic charge occurs only when paid balance crosses the threshold through a supported debit path.

Stripe's [test-card reference](https://docs.stripe.com/testing) lists additional cards for failure and authentication scenarios.

## Verify durable state

The UI is the customer-facing check. The database must also show one durable top-up and one ledger credit. These commands assume the unchanged local Compose credentials:

```sh
docker compose -f docker-compose.dev.yml --env-file .env.dev exec -T postgres \
  psql -U quickvoice -d quickvoice -c \
  "SELECT t.\"topUpId\", t.status, t.kind, t.\"stripePaymentIntentId\", t.\"amountMicros\", t.\"creditedMicros\", t.\"refundedMicros\", t.\"disputedMicros\", count(bt.\"billingTransactionId\") AS credit_rows, coalesce(sum(bt.\"paidBalanceDeltaMicros\"), 0) AS paid_delta_micros FROM \"TopUp\" t LEFT JOIN \"BillingTransaction\" bt ON bt.\"referenceType\" = 'top_up' AND bt.\"referenceId\" = t.\"topUpId\" AND bt.type = 'TOP_UP' WHERE t.kind = 'MANUAL' GROUP BY t.\"topUpId\" ORDER BY max(t.\"createdAt\") DESC LIMIT 5;"
```

For the new row, expect `status=SUCCEEDED`, `amountMicros=5000000`, `creditedMicros=5000000`, `credit_rows=1`, and `paid_delta_micros=5000000`.

Check webhook processing and saved auto-recharge state:

```sh
docker compose -f docker-compose.dev.yml --env-file .env.dev exec -T postgres \
  psql -U quickvoice -d quickvoice -c \
  'SELECT "stripeEventId", type, status, attempts, "lastError", "processedAt" FROM "StripeWebhookEvent" ORDER BY "receivedAt" DESC LIMIT 15;'

docker compose -f docker-compose.dev.yml --env-file .env.dev exec -T postgres \
  psql -U quickvoice -d quickvoice -c \
  'SELECT "organizationId", "paidBalanceMicros", "promotionalBalanceMicros", "debtMicros", "stripePaymentMethodId", "autoRechargeEnabled", "autoRechargeThresholdMicros", "autoRechargeAmountMicros" FROM "BillingAccount" ORDER BY "updatedAt" DESC LIMIT 5;'
```

The relevant webhook rows should be `PROCESSED` with no `lastError`. The selected organization should have a non-null `stripePaymentMethodId`, `autoRechargeEnabled=true`, `autoRechargeThresholdMicros=5000000`, and `autoRechargeAmountMicros=20000000`.

## Replay and refund checks

### Duplicate delivery

Exact replay requires a Stripe-registered test webhook endpoint; running `stripe trigger` creates a new event and is not a duplicate-delivery test.

1. Expose the local API through an HTTPS development tunnel you control.
2. In Stripe Workbench, create a **test** webhook endpoint ending in `/api/v1/billing/stripe/webhook`, subscribe it to the nine wallet events listed above, and put that endpoint's `whsec_...` value in `STRIPE_WALLET_WEBHOOK_SECRET`.
3. Restart the API, complete a new `$5` top-up through the registered endpoint, and note its `evt_...` delivery ID and endpoint `we_...` ID.
4. Click **Resend** on that event in Stripe Workbench, or run:

```sh
stripe events resend evt_REPLACE_ME --webhook-endpoint=we_REPLACE_ME
```

Re-run the durable-state query. The top-up must still have `credit_rows=1`, its credited amount must remain `5000000`, and paid balance must not increase a second time. See Stripe's [manual retry documentation](https://docs.stripe.com/webhooks#manual-retries) for replay limits.

### Full refund

Use the `pi_...` ID from the latest `TopUp` row or Stripe Workbench, then refund the unused `$5` test payment:

```sh
stripe refunds create --payment-intent=pi_REPLACE_ME --amount=500
```

Wait for `charge.refunded`, then refresh the billing page and re-run the database queries. Expect the top-up to become `REFUNDED`, `refundedMicros=5000000`, one `REFUND` ledger transaction, and a `$5.00` paid-balance reversal. If some credit was already spent, the reversal can create debt instead of making paid balance negative; use a fresh organization to keep this assertion simple. Re-sending the refund event must not create another debit.

## Troubleshooting

- **`400` signature error:** copy the secret from the currently running listener or registered wallet endpoint, not the Dashboard API key or Better Auth webhook secret; then restart the API. Signature verification requires the unmodified raw body.
- **`404` from Stripe CLI:** confirm the API is on port `5000`, `API_VERSION=v1`, and the forward target is exactly `/api/v1/billing/stripe/webhook`.
- **Billing page says self-hosted or unmetered:** set `QUICKVOICE_BILLING_MODE=hosted` before starting the API.
- **Checkout is disabled:** set a `pk_test_...` key in `apps/console/.env.local`, restart the console, and confirm it belongs to the same sandbox as `STRIPE_SECRET_KEY`.
- **Checkout completes but balance stays pending:** keep `stripe listen` running, look for `checkout.session.completed`, and inspect `StripeWebhookEvent.lastError`. Do not treat the browser callback as fulfillment.
- **Saved card does not appear:** confirm `setup_intent.succeeded` is in the listener event list and was delivered with `200`, then reload after 30 seconds.
- **Automatic Tax or tax-code error:** keep `STRIPE_AUTOMATIC_TAX_ENABLED=false` and `STRIPE_WALLET_TAX_CODE` empty for this smoke test.
- **Synthetic event is ignored:** expected for generic Stripe fixtures whose metadata does not match a durable QuickVoice `TopUp`; complete Checkout in the console instead.

For underlying behavior, see Stripe's [webhook guide](https://docs.stripe.com/webhooks) and [Checkout fulfillment guide](https://docs.stripe.com/checkout/fulfillment).
