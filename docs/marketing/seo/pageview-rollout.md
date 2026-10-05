# Explicit pageview rollout

The web app can own both the initial `page_view` and subsequent completed App Router visits. This mode is staged behind `NEXT_PUBLIC_GA_MANUAL_PAGEVIEWS=true`; blank, `false`, and other values keep it disabled. Deploying the code with the default setting preserves the existing automatic initial pageview and adds no manual pageviews.

As checked on 2026-09-06, the production stream's enhanced browser-history measurement remains enabled and the connected Analytics account lacks edit access. **Do not enable manual mode until an authorized GA editor disables “Page changes based on browser history events” for the destination stream.** `send_page_view: false` suppresses the tag's initial automatic view, but does not suppress Enhanced Measurement's independent history events. [Google's pageview documentation](https://developers.google.com/analytics/devguides/collection/ga4/views) explains both controls.

Roll out in this order:

The measurement utility can inspect the exact stream with
`python3 scripts/seo-measurement-setup.py --pageviews manual --check`.
After secure edit access is available, `--pageviews manual --apply` disables only
browser-history pageviews and reads the setting back. It does not deploy the web
flag. For rollback, deploy the web flag as false first, then use
`--pageviews automatic --apply`. The default utility mode still handles only
lead/dimension registrations; pageview mode does not change those registrations.

1. Keep the build flag absent or `false` while deploying the staged code.
2. Using GA edit access, disable the stream's browser-history pageviews and verify the saved setting. Keep unrelated enhanced events unchanged. For QuickVoice, confirm the stream uses `G-SZFBG11VRP`.
3. Set `NEXT_PUBLIC_GA_MANUAL_PAGEVIEWS=true` in the marketing app's **build environment**, then rebuild and deploy. An ID override requires the same GA-side check for that destination.
4. Verify one initial view and one view per completed path/query change, including back/forward. Confirm updated title and referrer, and no view for unchanged URLs or fragments. Check actual collection and GA receipt separately. [Google's SPA verification guidance](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications) describes checking location and referrer across views.

The coordinator uses the existing measurement-ID rules: the default runs only on `quickvoice.co` and `www.quickvoice.co`; an explicit `G-` ID works on any host; `off` disables tracking. Manual mode configures `send_page_view: false`. It accepts only consented snapshots from the bootstrap's exact public-page manifest and the current origin, including explicitly published content slugs. Pending public snapshots may wait for tag readiness, but navigating to a blocked route, withdrawing consent or unmounting clears the queue. No blocked or denied snapshot may replay after returning or granting consent.

Locations are sanitized before queuing. Only single-valued `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` and `utm_term` tokens of 1–100 ASCII letters, digits, underscores or hyphens remain; long numeric-only tokens, duplicate values, other query fields and fragments are omitted. Campaign owners must still avoid personal data in campaign labels: token validation cannot establish what a label means. Dropped query-only changes do not create extra views. Sanitized campaign changes and nonconsecutive public back/forward visits do. Referrers retain only an HTTP(S) origin, with no credentials, path or query; a blocked/denied boundary starts a new sequence with an empty referrer. Titles are sampled after route commit, and delayed bootstrap/onReady retries the current route only.

This staged code does not repair the active automatic-history mode by itself. Before enabling it, verify actual committed-route titles, initial load, public navigation, back/forward, blocked transitions, consent withdrawal/re-consent and onReady in a rendered Next.js build, with every collection request intercepted. Then obtain the GA-side setting readback and paired production acceptance above. Keep the existing mode until those release gates are satisfied.

When streamed Next.js metadata temporarily leaves the title empty, the component waits for a nonempty title instead of queuing an empty one. Navigation or consent withdrawal cancels that wait. A consent-driven remount also starts with an empty referrer; it must not reuse the document's original referral source as another landing visit. Include delayed metadata, superseded navigation and withdrawal during the metadata wait in the rendered acceptance checks. A component harness with an inert Google script proves local lifecycle behavior only; it does not establish the full website integration, actual transport or processed attribution.

For rollback, rebuild with the manual flag `false` first, verify the new build, then restore GA's history setting if desired. This order avoids overlapping manual and automatic history collection. There may be a measurement gap during either transition; record the change times. Do not claim rollout complete while GA edit access or production enablement remains pending.
