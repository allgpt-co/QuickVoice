# Website contact delivery

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
