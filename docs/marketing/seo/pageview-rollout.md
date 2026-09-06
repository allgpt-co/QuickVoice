# Explicit pageview rollout

The web app can own both the initial `page_view` and subsequent completed App Router visits. This mode is staged behind `NEXT_PUBLIC_GA_MANUAL_PAGEVIEWS=true`; blank, `false`, and other values keep it disabled. Deploying the code with the default setting preserves the existing automatic initial pageview and adds no manual pageviews.

As checked on 2026-09-06, the production stream's enhanced browser-history measurement remains enabled and the connected Analytics account lacks edit access. **Do not enable manual mode until an authorized GA editor disables “Page changes based on browser history events” for the destination stream.** `send_page_view: false` suppresses the tag's initial automatic view, but does not suppress Enhanced Measurement's independent history events. [Google's pageview documentation](https://developers.google.com/analytics/devguides/collection/ga4/views) explains both controls.

Roll out in this order:

1. Keep the build flag absent or `false` while deploying the staged code.
2. Using GA edit access, disable the stream's browser-history pageviews and verify the saved setting. Keep unrelated enhanced events unchanged. For QuickVoice, confirm the stream uses `G-SZFBG11VRP`.
3. Set `NEXT_PUBLIC_GA_MANUAL_PAGEVIEWS=true` in the marketing app's **build environment**, then rebuild and deploy. An ID override requires the same GA-side check for that destination.
4. Verify one initial view and one view per completed path/query change, including back/forward. Confirm updated title and referrer, and no view for unchanged URLs or fragments. Check actual collection and GA receipt separately. [Google's SPA verification guidance](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications) describes checking location and referrer across views.

The coordinator uses the existing measurement-ID rules: the default runs only on `quickvoice.co` and `www.quickvoice.co`; an explicit `G-` ID works on any host; `off` disables tracking. Manual mode configures `send_page_view: false` and queues explicit events until the bootstrap is ready. It reads the title after the committed route updates and uses the preceding tracked URL as the next referrer. Query strings participate in view identity; fragments do not. Keep personal data out of page URLs, as with GA's automatic page-location collection.

For rollback, rebuild with the manual flag `false` first, verify the new build, then restore GA's history setting if desired. This order avoids overlapping manual and automatic history collection. There may be a measurement gap during either transition; record the change times. Do not claim rollout complete while GA edit access or production enablement remains pending.
