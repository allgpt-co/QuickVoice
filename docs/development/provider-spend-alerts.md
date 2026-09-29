# Provider spend and usage alerts

The server's `monitor-provider-spend` Inngest job runs every five minutes. It sends
one internal email warning at **3x or higher** normal daily usage per source,
UTC day, and recipient. There is no critical escalation at 4x or above.
An optional absolute daily cap triggers the same warning. Alerts do not stop
calls, suspend provider accounts, or change customer wallet charges.

## What is covered

| Source kind                    | Metric and coverage                                                                                                                                                                                                     | Credentials                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `twilio`                       | Account `totalprice` Usage Records in USD, including recurring charges. Each subaccount that is not included in the parent report needs its own monitor.                                                                | Account SID in `account`; auth token in `TWILIO_AUTH_TOKEN` or `tokenEnv`.                                                                                                                           |
| `deepgram`                     | Project Billing Breakdown dollar amounts, including STT and TTS line items.                                                                                                                                             | Project ID in `account`; billing-capable key in `DEEPGRAM_SPEND_API_KEY` or `tokenEnv`.                                                                                                              |
| `livekit`, `mode: analytics`   | LiveKit Cloud connection minutes. **Scale+ required. Not an invoice-cost monitor.** API history is limited to seven days; history accumulates in our database.                                                          | Project ID (`p_...`); `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, optionally named by `accessKeyEnv`/`secretEnv`.                                                                                    |
| `livekit`, `mode: application` | Estimated QuickVoice call connection minutes from `CallBillingSession`. Available without Cloud Analytics, but misses calls outside QuickVoice, missing worker reports, and deployments without wallet session records. | `account` is a stable label for this QuickVoice database/environment. No provider credentials.                                                                                                       |
| `aws`                          | Cost Explorer `UnblendedCost`, filtered to one linked AWS account. Covers that account's paid AWS services, including Bedrock and S3. Defaults to hourly polling because Cost Explorer API calls incur charges.         | Twelve-digit account ID; dedicated `AWS_SPEND_ACCESS_KEY_ID`, `AWS_SPEND_SECRET_ACCESS_KEY`, optional `AWS_SPEND_SESSION_TOKEN`. IAM needs `ce:GetCostAndUsage`. Custom environment names supported. |
| `http`                         | A trusted HTTPS billing exporter returning the daily USD contract below. Use for additional paid providers, such as Telnyx, ElevenLabs, Sarvam, or a complete LiveKit billing export.                                   | Exporter URL; optional bearer token named by `tokenEnv`.                                                                                                                                             |

These are provider costs **before QuickVoice markup**, or explicitly labelled
usage estimates. LiveKit connection minutes do not cover inference, hosted agent
deployment, recording, or bandwidth charges. A complete LiveKit dollar-cost alert
requires a billing export/feed covering your plan. Do not count models billed
through LiveKit again under the direct model provider. Do not monitor overlapping
parent/subaccount bills as independent costs.

An automatic `combined` USD monitor sums all configured dollar sources when at
least two exist. It excludes LiveKit minute metrics, requires a current collected
total from every included source, and inherits their reporting delays. Its
fallback baseline and minimum alert amount are the sums of the individual settings.

## Thresholds and delivery

- All days use **UTC**, including midnight rollover.
- The baseline is the arithmetic mean of available successful days in the
  previous 14 complete days, excluding days with usage warnings.
  At least seven eligible days and a positive sum are required. Otherwise the
  configured `baseline` is used. Successful zero-usage days count; missing data does not.
- Today and the previous two UTC dates are evaluated, so charges published after
  midnight can still alert for their original usage date. Older backfills update
  history but do not send new alerts. First activation can therefore notify about
  a spike in either of the previous two days.
- The baseline freezes on the first evaluation of each UTC date.
  Today's spike cannot raise today's threshold. Changing the fallback takes
  effect on the next UTC day; changing `dailyCap` takes effect on the next collection.
- Warn at `amount >= 3 * baseline`.
  The `minimum` floor must also be reached. `dailyCap` triggers the same warning
  independently of the multiplier/floor. All three amounts use the source's unit:
  USD for cost sources, connection minutes for LiveKit.
- Example: baseline $20, minimum $5 -> warning $60, with no new warning at $80
  or $100 that UTC day. A configured cap of $50 instead warns at $50, with no
  extra warning when the 3x threshold is subsequently reached.
- Compare today's cumulative usage with the normal **full day's** usage. This
  release does not extrapolate a partial day or use a same-hour historical model.
- One usage warning per source/day/recipient. Jumping straight to 4x or higher
  also sends that single warning. Subsequent increases or downward revisions do
  not send another usage warning for that date. Failed recipients retry independently.
- Delivery claims prevent concurrent workers sending the same pending email.
  SMTP/ZeptoMail and PostgreSQL cannot commit atomically: a process crash after
  acceptance but before recording `sentAt` can cause a retry/duplicate.
- Failed collection does not overwrite costs with zero. A first-collection failure
  alerts immediately; subsequent failures alert after 30 minutes or two collection
  intervals, whichever is longer. A known provider timestamp older than one hour
  (26 hours for AWS) is treated as unavailable. Successful collection time is not
  proof that a provider has finished publishing its billing data.
- Pending delivery retries are retained for seven days. Removed recipients or
  sources do not receive queued alerts. Templates contain account identifiers and
  totals, not transcripts, phone numbers, API keys, or provider response bodies.

## Deployment

1. Apply the normal server migration before enabling the monitor:

   ```sh
   cd apps/server
   pnpm exec prisma migrate deploy
   ```

   This adds `ProviderSpendDay`, `ProviderSpendAlert`, and
   `ProviderSpendDelivery`. It does not modify wallet tables. Generate/build the
   server through the existing image pipeline.

2. Set `PROVIDER_SPEND_ALERT_RECIPIENTS` on **quickvoice-server** to the internal
   team's comma-separated addresses. A private, ignored
   `apps/server/.env.provider-spend.local` deployment snippet contains the five
   recipients supplied for this installation. It is not automatically loaded by
   the server or included in the Docker image; copy its variables into Coolify.

3. Set `PROVIDER_SPEND_MONITORS` to JSON for the accounts you actually use.
   The following values are **examples, not your production account IDs or budgets**:

   ```json
   [
     {
       "key": "twilio",
       "kind": "twilio",
       "account": "AC00000000000000000000000000000000",
       "baseline": 20,
       "minimum": 5,
       "dailyCap": 100
     },
     {
       "key": "deepgram",
       "kind": "deepgram",
       "account": "YOUR_PROJECT_ID",
       "baseline": 10,
       "minimum": 5,
       "dailyCap": 60
     },
     {
       "key": "livekit",
       "kind": "livekit",
       "mode": "application",
       "account": "quickvoice-production",
       "baseline": 1000,
       "minimum": 100,
       "dailyCap": 5000
     },
     {
       "key": "aws",
       "kind": "aws",
       "account": "123456789012",
       "baseline": 15,
       "minimum": 5,
       "dailyCap": 100
     }
   ]
   ```

   Review fallback baselines and caps before enabling. For LiveKit Scale+ change
   `mode` to `analytics` and supply the actual `p_...` project ID. Account/mode
   changes deliberately create a new history scope. Configure only one metric
   source per provider account to avoid duplicates. Keys must be unique;
   `combined` is reserved. Up to 30 monitors and 50 recipients are accepted.

4. Add the provider credentials listed above **to the server**, using billing-read
   permissions where supported. AI container variables are not automatically
   available in the server. AWS billing credentials are intentionally separate
   from S3 credentials. The AWS collector uses the Cost Explorer endpoint in
   `us-east-1`, independent of the application's compute region. It currently
   accepts explicit access keys/session tokens, not an instance-role credential chain.

5. Verify the existing `FROM_EMAIL` and SMTP or ZeptoMail settings. Alerts reuse
   the same transport as existing QuickVoice emails; no new email provider is needed.

6. Set `PROVIDER_SPEND_ALERTS_ENABLED=true`, deploy the server, and verify
   `monitor-provider-spend` is registered/running in Inngest. Keep production
   `INNGEST_SIGNING_KEY` configured. Merely enabling the environment flag without
   a working Inngest scheduler does not run the monitor.

7. Check first-run history and delivery results in the three new tables. Monitor
   failed Inngest runs externally, because a stopped scheduler or unavailable email
   service cannot reliably announce its own failure. Configure provider-native
   Twilio Usage Triggers and AWS Cost Anomaly Detection as independent backups.
   This implementation does not create provider triggers or suspend accounts.

8. Use a dedicated test account/exporter and test recipients for a delivery smoke
   test. Move below 3x -> 3x -> repeated 3x -> 4x -> 5x and confirm only one warning
   per recipient. Test a failed recipient, provider 503, stale timestamps,
   and UTC rollover before relying on production alerts.

## Additional provider exporter contract

Configure an admin-owned HTTPS exporter. The monitor makes `GET` requests with
inclusive UTC `start=YYYY-MM-DD` and `end=YYYY-MM-DD` query parameters. Redirects
are rejected, and credentials are sent only to the configured URL. Return daily
**cumulative totals**, not deltas or overlapping categories:

```json
{
  "currency": "USD",
  "asOf": "2026-09-28T12:00:00Z",
  "days": [
    { "day": "2026-09-27", "amountUsd": "20.00", "estimated": false },
    { "day": "2026-09-28", "amountUsd": "65.00", "estimated": false }
  ]
}
```

```json
{
  "key": "elevenlabs",
  "kind": "http",
  "account": "production",
  "url": "https://YOUR_INTERNAL_EXPORTER/daily/elevenlabs",
  "tokenEnv": "ELEVENLABS_BILLING_EXPORT_TOKEN",
  "baseline": 10,
  "minimum": 5
}
```

Missing history stays unknown. Today's entry is required, even for a confirmed
zero. Duplicate dates, unsupported currency, invalid/negative values, stale data,
and failed requests are not accepted as zero usage. This connector is a contract
for an exporter you operate; it does not magically give an arbitrary vendor a
compatible billing endpoint.

## Limits and verification

LiveKit Analytics collection is bounded at 1,000 sessions per run and refuses
partial totals above that limit. Larger projects need incremental session ingestion
and caching before enabling this adapter. Cross-midnight Analytics totals are
apportioned across days by elapsed session time, so per-day attribution is estimated.
Costs from AWS and other providers may arrive hours later; these alerts do not
replace prepaid enforcement, call-duration limits, or destination restrictions.

No new packages are required. Run:

```sh
pnpm --filter server exec prisma generate
pnpm --filter server check-types
pnpm --filter server exec tsx --test tests/billing/provider-spend.test.ts
pnpm --filter server test
```

Tests use synthetic provider reports, an in-memory persistence implementation, and
mocked email transport. They never contact production billing accounts or send mail.

References: [Twilio Usage Records](https://www.twilio.com/docs/usage/api/usage-record),
[Twilio Usage Triggers](https://www.twilio.com/docs/usage/api/usage-trigger),
[Deepgram Billing Breakdown](https://developers.deepgram.com/reference/manage/billing/breakdown/get),
[LiveKit Analytics](https://docs.livekit.io/deploy/admin/analytics-api/),
[AWS GetCostAndUsage](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_GetCostAndUsage.html),
[AWS reporting latency](https://docs.aws.amazon.com/cost-management/latest/userguide/manage-ad.html).
