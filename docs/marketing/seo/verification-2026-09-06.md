# SEO implementation verification — 2026-09-06

The implementation and campaign preparation were completed in the original local workspace. This report preserves that verification history; the PR worktree's checks are recorded separately in the PR and CI. Production deployment, live measurement activation, future campaign execution, and evidence-dependent customer stories remain pending. No outreach or directory submission was sent.

**Subsequent live check:** Search Console is active. GA4's existing property has historical data, but the tested live site does not load its tag; the last recorded activity is August 11. This is an additional production tracking gap, separate from registering the new enquiry key event. See the [live measurement check](live-measurement-check-2026-09-06.md).

## Implemented scope

- Added the permanent `www.quickvoice.co` → `quickvoice.co` redirect and homepage canonical.
- Added content-bound article reviews. Indexing, sitemap inclusion, review notices, related-article promotion, and BlogPosting schema use the same review eligibility. Content or metadata edits invalidate the review until it is renewed.
- Rewrote and reviewed the selected 12 articles with current primary sources and repository checks. All 90 original publication dates and slugs are preserved, including the 25 future dates. Substantive updates use `updatedAt: 2026-09-06`.
- Refreshed the homepage and six business workflow pages, connected buyer guides to relevant workflows, and corrected unsupported contact/pricing schema and copy. Scheduling content explicitly distinguishes request capture from booking through an implemented authorization path.
- Corrected mobile overflow on the contact and article pages and eagerly loaded the homepage image identified as LCP during browser review.
- Made contact success depend on an accepting webhook. Missing configuration returns 503, delivery failure returns 502, and successful delivery returns 200. `generate_lead` carries only method, form location, and page path; submitted personal details are excluded.
- Rejected unsupported claims-audit suppression markers, corrected the license guidance to MIT, and added web tests plus the campaign evidence audit to CI.
- Prepared the inventory, keyword map, 90-day calendar, promotional/nurture drafts, buyer resources, walkthrough script, distribution research, listing packages, and customer-story evidence templates.

## PR worktree checks — 2026-09-06

The release agent reports that the clean PR worktree based on the latest `main` passed the frozen-lockfile install, 37 root tests, 27 web tests, web lint/type checks, the campaign claims audit across 69 files, and the production web build with 138 generated pages. Consult the PR and CI for the final checked revision and any subsequent changes. `task doctor` could not run because go-task and Corepack were unavailable; the shell wrapper identified those missing prerequisites, which is not a passing doctor check.

Repository artifact and documentation validation confirms 156 inventory rows (90 blogs, 33 scenarios, 33 static marketing routes), 12 matching keyword rows with valid article review hashes, 90 contiguous calendar days, and 20 distinct distribution opportunities. The keyword review statuses now match the reviewed source and preserve deployment as pending.

## Historical local checks

These results were captured in the original workspace before the changes were transferred onto the PR branch from the latest `main`. Build `MCY9Tlu_enWcgCffaXyLO` also predates the Analytics fallback repair; that repair's separate local build is documented in the [live measurement check](live-measurement-check-2026-09-06.md). These are historical observations, not a claim that the current PR revision has been built or deployed.

| Check | Result |
| --- | --- |
| `node --test tests/*.test.mjs` | 35 passed. The three claims-audit tests were also rerun after the audit extension change in that pass. |
| `pnpm --filter web test` | 24 passed in this verification pass. Covers publication/review boundaries, truthful dates, redirects, sitemap filtering, review issuance, and contact delivery/analytics. |
| `pnpm claims:audit:seo` | 68 campaign source/content files, zero blocked findings. This scan complements factual review; it does not prove correctness by itself. |
| `pnpm --filter web lint` and `pnpm --filter web check-types` | Passed. The corresponding local production build also completed TypeScript validation. |
| `pnpm --filter web build` | Passed; 138 generated pages. Local build ID: `MCY9Tlu_enWcgCffaXyLO`. |
| Production HTTP checks | All 45 sitemap URLs returned 200 with matching apex canonicals, indexable robots, a description, one H1, and parseable JSON-LD. |
| Sitemap contents | 33 static routes plus 12 reviewed articles. Static entries have no invented lastmod; article lastmod is the substantive update date. |
| Publication boundaries | Sample legacy article and illustrative scenario remain noindex without Article/BlogPosting schema. A future article returns 404. The blog displays 12 reviewed guides and 53 published legacy titles in a collapsed archive. |
| Host normalization | Local production request with `Host: www.quickvoice.co` returned 308 to the apex, preserving article path and query string. |
| Browser checks | Desktop 1440px and mobile 390px homepage/workflow checks passed. Final mobile contact/article widths fit 390px. Reviewed article metadata, schema, and notice removal checked in the browser. |
| Contact browser behavior | Mocked failure retained form values and emitted no lead; mocked success emitted exactly one lead event without submitted personal data. Production-browser check accepted a formatted phone number. Test traffic did not send a real enquiry or analytics event externally. |
| Local production performance | One unthrottled mobile observation each for homepage, workflow, and article: LCP 156/132/132ms, observed CLS 0, and no horizontal overflow. Short observation windows and reused browser cache; these are not field Core Web Vitals. |
| Campaign assets | 156 inventory rows, 12 keyword rows, 90 calendar days, 20 distinct researched channels, valid local document links, and independently checked cost calculations. |
| `git diff --check` | Passed. |

Repository evidence: [local production HTTP results](verification-assets/production-smoke.json), [performance and contact observations](verification-assets/performance-observations.json), [mobile homepage screenshot](verification-assets/seo-home-mobile.png), and [desktop appointment-workflow screenshot](verification-assets/seo-workflow-desktop.png). See the [artifact provenance and limits](verification-assets/README.md). Browser observations are local checks, not production field Core Web Vitals or evidence of ranking improvement.

## Remaining dependencies

1. **Release:** deploy the reviewed changes using the project's release process. No marketing-site deployment credentials or configured deployment target were available in this session. Verify the live redirect, robots, canonicals, sitemap, dates, schema and mobile routes after release; then request sitemap processing through Search Console as appropriate.
2. **Contact and analytics:** configure an accepting production `CONTACT_WEBHOOK_URL`, verify an authorized end-to-end enquiry, observe `generate_lead` in GA4 property `543950329`, and register it as a key event. The connected GA token has read-only analytics scope, so administrative activation was not performed. Local mocks do not establish production webhook delivery or GA collection.
3. **Campaign execution:** set the actual start date and named owners. Sending posts, emails, pitches, directory submissions, and recording a walkthrough remain scheduled work. The assets are prepared; the next 90 days have not been executed.
4. **Evidence backlog:** the other 78 articles remain pending source review; 33 scenarios remain illustrative and cannot substitute for real customer proof. Real stories require customer evidence and publication permission.

Use the [runbook](README.md), [publishing workflow](publishing-workflow.md), and [status tracker](source-status.md) for the next steps. Historical source plans remain historical records; these files document which work is implemented, superseded, scheduled, or dependent on external input.
