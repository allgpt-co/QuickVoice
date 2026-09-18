# Reproducible SEO reporting

Use `scripts/seo-snapshot.py` to capture read-only GSC and GA4 observations, with **US acquisition as the primary cohort** and global context retained. It does not change Analytics settings, submit sitemaps, request indexing, send events/email, or start a campaign. It refreshes the existing authorized Google credentials in memory and writes raw JSON plus a Markdown summary to new local files with owner-only permissions (`0600`). Keep both exports out of Git under ignored `output/seo/`; record only sanitized aggregate findings in the execution tracker.

The process environment needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN`. Use the existing secure connection or secret manager; never paste these values into a command, report or repository file. Read access to GA property `543950329` and GSC `sc-domain:quickvoice.co` is sufficient for reports. GA administration still needs separate edit access.

```sh
python3 -m unittest discover -s scripts -p test_seo_snapshot.py
python3 scripts/seo-snapshot.py \
  --output "output/seo/$(date -u +%F)/us-seo-$(date -u +%H%M%S).json"
```

Choose a new filename for every observation; existing raw or summary files are never overwritten. `--summary` can select a separate Markdown filename. A manual run is not a scheduled job or proof that a future review happened. The growth owner should run it weekly, record the observation/end dates, review the top changed query-page pairs, and reconcile delivered/qualified enquiries with the offline lead scorecard.

## Dates and reproducible comparisons

- By default, query the latest 21 days twice (`dataState=all` and `final`). Use Google's `firstIncompleteDate` minus one day; if that field is absent, conservatively use the newest returned final daily row. No final rows means failure, not an assumed date.
- Read the GA property timezone and cap the aligned end at two property-calendar days before today (`--ga-lag-days`, minimum 2). **GA has no equivalent final-data certificate**: this is a lag buffer, not a guarantee against later revisions. GSC uses Pacific calendar days; GA uses its returned property timezone. Same date labels do not equate clicks and sessions.
- Default comparisons are **28 complete days versus the immediately preceding 28**, and **90 versus the immediately preceding 90**. Every summary section includes inclusive start/end dates and day count. `--days 7` changes the short comparison; `--long-days 90` controls the long one. Identical lengths are not duplicated.
- `--end YYYY-MM-DD` is optional for an historical rerun. An end newer than the probed aligned safe date is rejected, not silently truncated. Failed freshness/property probes are exported with their error status and comparisons are not generated.
- For the QuickVoice property's first 90 recovery days (end dates September 6–December 4, 2026), also report **September 6 through the aligned end** as `post_recovery`. This is an observed post-repair cohort, not proof that QA traffic has been excluded. Later reviews use rolling complete periods rather than an ever-longer recovery total.
- GA was created **July 2, 2026**. Its known August 12–September 5 measurement interruption makes comparisons crossing that interval unsuitable for growth claims. The summary marks windows before creation as unavailable, not zero traffic; partially observed windows remain explicitly partial. Do not backfill missing sessions or attribute business outcomes using GSC clicks.

## Exact cohorts

| Report | Definition |
|---|---|
| GSC global context | Web search, all countries/devices, final data, separate property totals |
| GSC US total | Same filters plus `country = usa`; no query filter, so anonymized-query activity remains in totals |
| GSC US reported brand | US plus query `includingRegex: quick\s*voice` |
| GSC US reported nonbrand | US plus the identical query regex using `excludingRegex` |
| GA global context | Existing all-traffic totals, channels, source/medium and landing-page reports retained |
| GA US all traffic | `country = United States`; hostname `quickvoice.co` or `www.quickvoice.co` |
| GA US organic | Same US/hostname filters plus `sessionDefaultChannelGroup = Organic Search` (all search engines, not just Google) |

`--brand-regex` overrides the GSC RE2 expression for both included/excluded cohorts. Treat changes as a new baseline and record the exact regex. This is a simple brand-string classification, not Google's machine-classified brand feature. Ambiguous navigational queries and unrelated brands can remain in the nonbrand cohort; manually review intent before claiming qualified demand.

## Interpret the exports

- **Query anonymity:** the summary compares returned US query-row clicks/impressions with independent US totals. The missing remainder is never assigned to either brand cohort. “Zero clicks from reported US nonbrand queries” does not establish zero total US nonbrand clicks. Including/excluding a query filter also omits anonymized data.
- GSC reports include global totals/daily/pages/queries and US totals/daily/devices/pages/query-page pairs. The heuristic query-cluster table sums **query-only** rows and weights position by impressions. Each query belongs to one cluster; the order is alternatives/comparisons, open source, scheduling, IVR, multilingual, automotive, receptionist/answering, pricing, other. These clusters are an inspection aid, not proof of intent, cannibalization, or predicted traffic.
- GA retains US organic landing pages and full event-name counts separately from session totals. The summary calls out `generate_lead`, `qualify_lead`, and `close_convert_lead`; **all `keyEvents` are not an enquiry count**. Key-event registration is read from the Admin API, and missing `generate_lead` registration is flagged.
- A delivered enquiry, a booked meeting, a qualified opportunity, and a GA event are different facts. Use inbox/CRM evidence and the offline lead scorecard for business outcomes. Never infer organic source for an enquiry with unknown attribution, and keep synthetic QA activity out of business-result claims.
- The script records each failed request as an error and exits nonzero. It does not replace failures with zero activity. Empty successful responses mean no recorded rows for that request, not evidence that no enquiries or users existed.
- Grouped requests cap GSC at **25,000 top rows**, GA at **10,000 rows**; there is no exhaustive-row claim or hidden-query estimate. A reached cap is flagged. Inspect GA `rowCount` and retained `metadata` for thresholding, sampling, and other-row loss. GSC can omit rows even below the cap. A daily-row gap alone cannot distinguish no traffic from absent measurement.
- Sitemap `contents[].indexed` is deprecated and never used as an indexed-page count. URL Inspection describes Google's most recent indexed/crawled observation, not a live URL test. Compare it with the actual response status, robots directives, canonical and last-crawl date before calling an old exclusion a current defect.

## September 16, 2026 verification

The live read-only run completed **141 requests with zero errors**, using final GSC data through **September 14** and the GA timezone **America/Los_Angeles**. Raw reports and the Markdown summary are local-only at `output/seo/2026-09-16/us-seo-snapshot-final.{json,md}`, both `0600`. Fifteen offline tests passed covering inclusive date boundaries, incomplete dates, timezone-lag alignment, US/brand filters, distinct event/session reports, weighted clusters, file exclusivity/privacy, API failures, row limits, and pre-creation warnings.

- Current 28 days (August 18–September 14): US GSC **8 clicks / 933 impressions**; previous 28 (July 21–August 17): **10 / 1,611**. Current reported US nonbrand: **0 clicks / 373 impressions**. Returned US queries explain **4 of 8 clicks**; do not classify the other four.
- The same current GA window recorded **8 US production-host organic sessions**, **4 engaged sessions**, and **0 `generate_lead` events**. The historical measurement gap invalidates a growth-rate comparison. This is not proof of zero delivered or qualified enquiries.
- The live sitemap returns **99 unique URLs**, all on the canonical apex origin (the homepage omits its optional trailing slash). Search Console last downloaded it **September 15, 14:17 UTC**, with zero errors/warnings. **No redundant sitemap submission was needed or performed.**
- Twelve priority public pages returned HTTP 200, `index, follow`, and the expected canonical. Eight were reported indexed. The stale exceptions remain automotive (crawled-not-indexed, August 31 crawl), best-platforms (crawled-not-indexed, September 6), Retell alternatives (noindex, August 7), and ElevenLabs/Deepgram (404, July 11). These historical observations are not current HTTP/noindex failures; monitor recrawl after meaningful content changes.

Admin reads establish settings only; they do not establish browser collection, successful form delivery, deployment of this branch, or qualified pipeline. No external settings changes, sitemap submission, indexing requests, events or lead submissions were performed by this reporting workflow.

References: [Google Search Analytics query API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [query anonymity and filtering](https://developers.google.com/search/blog/2022/10/performance-data-deep-dive), [sitemap API field deprecation](https://developers.google.com/webmaster-tools/v1/sitemaps), [GA4 Data API reporting](https://developers.google.com/analytics/devguides/reporting/data/v1/basics).
