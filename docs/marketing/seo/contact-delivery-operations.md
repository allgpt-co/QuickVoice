# Website contact delivery

## September 16: optional enquiry attribution rollout

The SEO growth branch adds an optional `submissionId` (UUID v4), `formLocation`, and
`attribution` (`landingPage`, coarse `source`/`medium`, `method: browser_observed`).
The API validates these fields and includes them in the internal enquiry email.
The new enquiry/attribution payloads add no contact field, receipt ID, raw
referrer, or URL query value to the `generate_lead` parameters sent to GA4.
This does not certify all existing Analytics collection: automatic pageviews and
the existing manual-pageview coordinator can include query values in page URL
and referrer fields. Their URL-redaction behavior requires a separate privacy
audit; this rollout does not change pageview or tracking behavior.

**Deploy the API receiver first.** Only after that version is healthy, set the web
service's server-only `CONTACT_ATTRIBUTION_ENABLED=true` and deploy/restart web.
The flag is false by default: the old strict receiver must not suddenly receive
unknown fields and reject enquiries. An external webhook must explicitly support
these optional fields before enabling the flag. To roll back, disable the web
flag before rolling back the API. There is no database migration.

The browser captures the first public landing path and coarse observed source
for the current document in memory. Internal SPA navigation keeps that context;
a full reload starts a new observation. No cookies, localStorage, sessionStorage,
or cross-site visitor ID are introduced. Tagged campaign traffic is unknown, and
paid click identifiers cannot be classified as organic. Referrer-based organic
classification is only a browser observation; it does not establish country,
Google Search Console attribution, or a qualified prospect. Missing context is
unknown, never silently credited to SEO.

The form holds one submission ID across manual retries and creates a new one for
"Send another message". Synchronous submit locking prevents concurrent browser
submissions, and acknowledged lead events are deduplicated in page memory. This
is **not durable exactly-once email delivery**: a network timeout can follow
provider acceptance. The receiving team must reconcile repeated submission IDs
and deduplicate prospects in sales records. Do not add automatic email retries.
Stable browser receipts require `crypto.randomUUID` in the current document.
When it is unavailable, the enabled API can issue a receipt for each request,
but this fallback cannot guarantee a stable receipt across manual retries or
deduplicate an ambiguous timeout before the response arrives. A full document
reload also loses browser-held receipt state; reconcile those cases privately.
The offline lead scorecard consumes opaque sales IDs rather than contact PII;
see [measurement operations](measurement-operations.md).

Required staging checks: old payload accepted; extended payload accepted after
API rollout; flag-off forwarding contains only legacy fields; rejected/failed
forwarding never emits `generate_lead`; one successful submission emits it once;
new enquiry event parameters exclude receipt IDs, query values and contact data.
These checks do not assert URL-field redaction for other Analytics events.
Browser tests intercept analytics,
session recording, email forwarding, and scheduling; no real lead is required.

The implementation does not emit `demo_booked`, `qualify_lead`, or closed-won
events from a CTA. Completed bookings and sales acceptance remain source-record
facts until an authorized integration is implemented and verified.

The web contact handler can send enquiries through the API server's existing ZeptoMail/SMTP mailer. The API accepts only the expected contact fields, authenticates the web server with a dedicated shared secret, and sends to a server-configured single recipient. It does not accept a recipient, subject, sender or arbitrary mail options from the browser.

## Configuration

1. Keep the server's existing verified `FROM_EMAIL` and working mail transport. A nonempty `ZEPTOMAIL_TOKEN` selects the ZeptoMail HTTP API; otherwise `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME` and `SMTP_PASSWORD` select SMTP. The existing authentication and billing-email configuration and content are retained.
2. Generate a dedicated random secret with `openssl rand -hex 32` and store the same value as `CONTACT_WEBHOOK_SECRET` in the **server-only** runtime environment of both web and API services. The API fails closed when this value is missing or shorter than 32 characters. Keep it out of `NEXT_PUBLIC_` variables, repository files, URLs and client-side scripts.
3. Set the web service's `CONTACT_WEBHOOK_URL` to the API's direct HTTPS endpoint, for example `https://your-api-host/api/v1/contact-delivery`. Replace `v1` if the API uses another `API_VERSION`. Authenticated forwarding rejects redirects so the credential is not sent to a redirect target. For local evaluation use the directly reachable local API URL.
4. The API recipient defaults to `info@quickvoice.co`. Self-hosters may set the API-only `CONTACT_RECIPIENT_EMAIL` to one valid mailbox. Neither this setting nor provider credentials belong in the web service. The submitted, validated email is used only as Reply-To; `FROM_EMAIL` remains the verified sender.
5. Deploy/restart the API with its configuration, then configure and release the web service. Existing external webhooks remain compatible when the web secret is blank: no authentication header is added and their existing success contract is unchanged. The new API endpoint always requires its secret.

The web sends `X-QuickVoice-Contact-Secret`; the API compares fixed-length secret digests using `timingSafeEqual`. The endpoint remains behind the API's existing global rate limiter and authenticates before its 32 KB JSON parser. Names, company, phone, topic, message, fixed source and ISO timestamp are validated again by the API. HTML values are escaped and a plain-text part is supplied.

## Verification and failures

Run from the repository root:

```sh
pnpm --filter server exec tsx --test tests/mailer.test.ts tests/contact/*.test.ts
pnpm --filter web test
pnpm --filter server check-types
pnpm --filter server build
```

Tests intercept provider traffic. They verify authentication failures, rejected recipient/header injection, HTML escaping, SMTP acceptance, bounded delivery waits, no automatic retry and unchanged auth-email behavior. No test sends a real enquiry or Analytics event.

API results: missing/short configured secret returns 503; wrong/missing request secret returns 401; invalid JSON/submission returns 400; oversized JSON returns 413; unconfirmed provider delivery returns 502; provider acceptance returns 200 with `ok: true`. The browser-facing web contract remains 400 for invalid input, 503 for missing webhook configuration, 502 for failed forwarding and 200 with the existing success message after acknowledgement. `generate_lead` continues to fire only on that success path.

Contact delivery waits at most 8 seconds for a provider, below the web's 10-second timeout. ZeptoMail requests are aborted at the deadline; SMTP has bounded connection/greeting/socket/DNS waits plus an overall response deadline and transport cleanup. **A timeout can leave delivery status unknown**: an SMTP transaction or provider-accepted message cannot be recalled by an HTTP timeout. There is no automatic retry or fallback to another transport. Before a manual resend, inspect provider activity and the destination inbox to avoid duplicates.

After deployment, perform one explicitly authorized enquiry with synthetic details and a unique test marker. Verify provider acceptance and actual arrival in the configured inbox; provider acceptance alone does not guarantee inbox placement. Check the Reply-To and formatting, then verify the browser's successful response and the expected Analytics event separately. Record only the marker, timestamps and outcome in the tracker; keep contact data, secrets and raw provider responses out of the repository. GA key-event registration remains a separate administrative action.
