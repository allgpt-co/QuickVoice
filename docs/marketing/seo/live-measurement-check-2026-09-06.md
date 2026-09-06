# Live Analytics and Search Console check — 2026-09-06

**At the September 6 check, Search Console was active. GA4 was configured as a property but its tag was absent from the tested live site.** This report records that observation; it is not a post-deployment check of the PR. It distinguishes access to historical reports from website collection.

## Search Console

- Verified owner access to `sc-domain:quickvoice.co`.
- Homepage URL inspection: **Submitted and indexed**, successful Google fetch, indexing allowed. Last crawl: 2026-09-03 21:43:52 UTC; Google's canonical is `https://quickvoice.co/`.
- Sitemap last downloaded: **2026-09-05 21:47:38 UTC**, with zero errors and warnings. It still reports 128 submitted URLs. The API's legacy `indexed` sitemap field is not used as an indexed-page count.
- Final Web Search data for 2026-08-07 through 2026-09-03: **37 clicks / 1,433 impressions**. Daily data is present through September 5; September 5 is flagged incomplete.

## Google Analytics

- Property `543950329` is QuickVoice; web stream `15188028920` targets `https://quickvoice.co` with measurement ID **`G-SZFBG11VRP`**.
- The latest recorded activity returned for July 2 through September 5 is **August 11, 2026**, in the property's America/Los_Angeles time zone. No rows were returned for August 30 through September 5. Realtime queries returned no activity during the check.
- In a fresh live Chromium visit, the homepage had no Google tag script, `window.gtag` was undefined, the data layer was empty, and no Analytics collection requests or tracking-request failures occurred after network idle plus ten seconds. External requests were not blocked by the test.
- Live HTTP checks also found no Google tag in the sample article and appointment-scheduling route.
- Registered key events are `close_convert_lead`, `qualify_lead`, and `purchase`. **`generate_lead` is not registered**, and it is absent from the August 9–September 5 event report.

Before the repair below, the application layout only included Analytics when `NEXT_PUBLIC_GA_MEASUREMENT_ID` was populated. A missing value in the deployed build is consistent with the observed missing tag; the hosting environment itself was not accessible, so that cause remains an inference.

The deployment configuration to verify is:

```dotenv
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-SZFBG11VRP
```

Set it for the production **build**, then rebuild and redeploy. Next.js embeds `NEXT_PUBLIC_` variables at build time; changing only the running service environment does not repair an already-built bundle. See [Next.js environment-variable documentation](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser).

After deployment, verify the loaded tag, collection requests to this measurement ID, and a corresponding Realtime page view. Separately verify the delivered-enquiry event and register `generate_lead` as a key event using an authorized GA administrator. [Google's key-event instructions](https://support.google.com/analytics/answer/13128484?hl=en) explain that registration affects collection going forward.

## Deployment status

The live site still serves the prior SEO version: 128 sitemap URLs, no homepage canonical, no www-to-apex redirect, and noindex on the refreshed sample article. The locally verified implementation has not appeared in production.

No configuration, deployment, form submission, or lead event was performed during this check. Raw authenticated reports and live tag/browser reports remain local-only in the original workspace; they are not included in the repository. Their key findings are recorded above. Local file paths:

- `output/seo/live-measurement-check-2026-09-06.json` (relative to the original workspace)
- `output/seo/live-tag-check-2026-09-06.json` (relative to the original workspace)

## Authorized repair after this check

Added the verified ID to [google-analytics-config.mjs](../../../apps/web/src/lib/google-analytics-config.mjs), used by the [application layout](../../../apps/web/src/app/layout.tsx). The default initializes only on `quickvoice.co` and `www.quickvoice.co`; an explicit environment ID overrides it, and `off` disables it. Missing production configuration will therefore no longer silently omit the tag once this change is deployed. Duplicate initialization is prevented.

The connected Coolify control could not be reached on its configured port 8444; standard HTTPS returned a Cloudflare 403 and did not establish access to Coolify. No production environment change or deployment was made. GA OAuth was refreshed and its scopes checked again: `analytics.readonly` is present, `analytics.edit` is absent, so `generate_lead` registration remains pending administrative access.

Historical local repair validation, before transfer onto the PR branch: 27 web tests passed, lint and type checks passed, the campaign audit passed across 69 files, and a production build with a deliberately blank measurement-ID setting succeeded (`mcQelttorQ6fTc10wwncU`). Its HTML includes the verified ID and guarded initializer. An intercepted production-browser check on the canonical hostname confirmed the expected tag URL and one initialization without sending traffic to Google. Unit checks cover other-host exclusion, explicit overrides, off, and repeat initialization; the browser checks also confirmed no duplicate initialization after internal navigation and no Google requests on localhost. Earlier navigation timeouts and the successful repeat check are documented in the [sanitized browser verification](verification-assets/ga-default-verification-2026-09-06.json). This historical build does not establish that the PR revision is deployed or that Google received an event.
