# Property-management SEO implementation — local verification

Verified September 26, 2026 on branch `agent/property-management-seo-20260926`, based on `origin/main` at `5884b77`. Work was isolated in `QuickVoice-property-seo-20260926`; the original dirty `QuickVoice` worktree was not edited. This records local implementation and tests, **not deployment, a Google indexing decision, actual customer calls, or elapsed campaign outcomes**.

## Implemented

- Retained `/industries/real-estate` as the sole property-management commercial owner. Replaced broad leasing/maintenance positioning with the scoped, staff-reviewed leasing-intake offer, fit boundaries, requirements, costs, factual FAQ/schema and enquiry CTA.
- Substantially revised the existing property-management guide; added distinct answering-services comparison, after-hours workflow, cost and integration guides. Four new articles use September 26 publication dates; the substantive revision uses September 26 modification date. Three contextual feeder edits preserve their existing modification dates. All eight affected articles have exact-content reviews from the existing review CLI, with truthful automated reviewer identity.
- Added the ungated property-management resource, fictional script/checklist and two CSV templates. Its 30 cases (10 categories × 3) are **unexecuted**, scorecard outcome fields are empty, and the evidence log contains no observations. No audio, video, customer logo, testimonial or invented metric was published.
- Connected the cluster through the industry hub, resources hub, commercial page, curated article journeys and sitemap. Added optional pilot-context guidance to the existing contact form, without changing required fields or the public payload contract.
- Extended the existing read-only report with exact seven-page US GSC and GA landing cohorts plus seven indexed-snapshot inspections. No new scheduler, administrative GA mutation or lead-scorecard schema change.
- Preserved the decision evidence in the [baseline](property-management-baseline-2026-09-26.md), [keyword map](property-management-keyword-map.csv), and [execution/evidence runbook](property-management-execution.md).

## Automated checks

| Check | Result |
|---|---|
| `pnpm --filter web test` | **76 tests passed** |
| `python3 -m unittest discover -s scripts -p 'test_seo_*.py'` | **61 tests passed** |
| `node --test tests/public-claims-audit.test.mjs` | **5 tests passed** |
| `pnpm --filter web lint` | Passed; zero warnings |
| `pnpm --filter web check-types` | Passed |
| `pnpm --filter web build --webpack` | Optimized production build passed |
| `node scripts/check-seo-campaign.mjs` | Passed; **199 public content files** scanned |
| `git diff --check` | Passed |

Webpack was used with available local dependencies for the isolated worktree. This is a marketing-site build, not a claim that every unrelated application or Docker deployment was rebuilt. The local analytics configuration used `G-LOCALTEST`; deploy from source with the deployment's reviewed configuration, never by copying these local build artifacts.

## Production-build HTTP verification

The optimized site was served on loopback. All seven cohort pages returned **200**, had **one H1**, `index, follow`, the expected apex self-canonical, and appeared exactly in the generated sitemap. No article displayed the pending-review notice.

- Generated sitemap: **106 URLs**, versus the prior 101 (four new articles plus one resource).
- **33 unique local link destinations** from the seven pages returned 200.
- The illustrative property-management case-study detail remained **noindex** and excluded from the sitemap.
- Public downloads returned successfully; the browser-downloaded scorecard was byte-for-byte identical to its versioned source.

These observations establish local eligibility, not Google indexing or production behavior.

## Playwright browser verification

Used the installed Playwright CLI with Chromium against the loopback production build. External destinations were blocked; the Google tag request was fulfilled by a local no-op stub. The contact handler forwarded only to a loopback synthetic receiver. **No real email, booking, enquiry, customer call or analytics event was sent externally.**

Observed:

1. Initial consent was unknown/off: no tag and no analytics commands. Decline persisted across navigation.
2. At 390 px width, commercial and resource content fit without document-level horizontal overflow. Resource also fit at 1440 px; desktop/light and dark-mode screenshots were inspected.
3. Required contact validation was displayed before submission. A deliberately failed receiver response produced HTTP 502, retained the input and showed no success; retry with acknowledged receiver response produced HTTP 200.
4. Declined contact success emitted no GA events and forwarded no attribution. The failed/successful manual retry reused its receipt.
5. After allowing analytics, the browser inserted one Google tag and issued one config command. SPA navigation from the commercial CTA retained `/industries/real-estate` as consented enquiry landing context.
6. One acknowledged consented submission queued exactly one `generate_lead`, containing only method, form location and page path—no submitted contact data or receipt ID. No duplicate manual `page_view` was issued with manual tracking disabled.
7. Withdrawal disabled collection, suppressed the subsequent successful enquiry's event and attribution, and persisted across reload. A new enquiry used a new receipt.
8. The resource contained ten native disclosure groups and all 30 case descriptions in its rendered DOM. Enter toggled the focused disclosure. The CSV download completed.

**Limits:** the analytics transport was stubbed; these checks do not validate Google's automatic pageview collection, production GA reports, inbox arrival or the remote receiving service. The expected test 502 is intentional. An earlier development-server inspection had dev-only HMR origin errors; final behavior was checked against the optimized production server instead.

Local artifacts are under ignored `output/playwright/` and `output/seo/`: screenshots, CLI results, HTTP verification, and synthetic receiver records. They are not customer evidence and are not publication material.

## Release and external gates still open

- Review/commit/PR/merge and deploy this source revision; verify the actual live HTML and metadata afterward.
- Advance the **existing private weekly report's reviewed source pin** after merge, then capture the first exact seven-page baseline. Do not add another scheduler.
- Confirm production contact-receiver compatibility and optional attribution activation. An authorized inbox owner must verify one marked QA receipt and actual arrival; local receiver tests do not satisfy this gate.
- Run live URL Inspection and any justified indexing request through an authorized Search Console operator; read-only inspection snapshots cannot request indexing.
- Recruit five consenting property operators for interviews; run the actual 30-case synthetic call evaluation with staff-reviewed output evidence before performance/demo claims; obtain explicit permission for any later real customer story.
- Conduct the weekly and day-30/60/90 reviews. Targets and hypotheses are not completed results.
