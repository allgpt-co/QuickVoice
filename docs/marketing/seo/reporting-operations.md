# Reproducible SEO reporting

Use `scripts/seo-snapshot.py` to capture read-only GSC and GA4 observations with explicit date windows. The script does not change Analytics settings, submit sitemaps, send email or start a campaign. It refreshes the existing authorized Google credentials in memory and writes raw reports to a new local file with owner-only permissions. Keep raw exports out of Git; record aggregate findings and relevant public-page observations in a dated report.

The process environment needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN`. Use the existing secure connection or secret manager; never paste these values into a command, report or repository file. Read access to GA property `543950329` and GSC `sc-domain:quickvoice.co` is sufficient for reports. GA administration still needs separate edit access.

```sh
python3 -m unittest discover -s scripts -p test_seo_snapshot.py
python3 scripts/seo-snapshot.py --end 2026-09-03 --output output/seo/baseline-2026-09-06.json
```

Choose a new filename for each observation; existing files are not overwritten. The end date is inclusive. The default compares 28 days with the immediately preceding 28 days. For a weekly review, use `--days 7` and the last complete Sunday for which final GSC data is available. The runbook's 28-day and Day 30/60/90 reviews should use the same filters and event definitions. A manual run is not a scheduled job or proof that a future review happened.

## Interpret the exports

- GSC uses web search, all countries/devices and `dataState=final`. Its calendar dates are Pacific Time. Use the independent totals response for clicks, impressions and CTR; grouped query/page rows are bounded top-row reports and do not necessarily sum to property totals.
- GA reports all-traffic totals, channels, source/medium, landing pages and the exact `generate_lead` event. Organic sessions come from the Organic Search channel row. The response retains the property timezone, row count and reporting metadata. Do not call every GA key event an enquiry.
- Both systems use Pacific Time for this property at the recorded baseline. Recheck property metadata if settings change. The property creation date and the known tag interruption limit historical comparisons.
- The script records each failed request as an error and exits nonzero. It does not replace failures with zero activity. Empty successful responses mean no recorded rows for that request, not evidence that no enquiries or users existed.
- Grouped reports request at most 1,000 rows. Inspect GA `rowCount` and metadata before treating a table as exhaustive. Missing GSC query rows may reflect anonymization or API limits. A daily row gap alone cannot distinguish missing traffic from missing measurement.

The Admin API reads in the snapshot establish the currently registered key events and enhanced-measurement settings. They do not prove browser collection or inbox delivery. Keep those checks and actual qualified-opportunity outcomes in the execution tracker. Synthetic QA events must be identified in the dated release notes and excluded from business-result claims.

References: [Google Search Analytics query API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [GA4 Data API reporting](https://developers.google.com/analytics/devguides/reporting/data/v1/basics). The implementation was exercised against both APIs on 2026-09-06; five offline tests verify date boundaries, request definitions and error/empty-response handling.
