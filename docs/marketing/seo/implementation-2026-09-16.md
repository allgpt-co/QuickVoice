# US SEO growth implementation — September 16, 2026

## Release status and scope

**Implemented and locally verified; not deployed.** Work is isolated in branch
`agent/seo-growth-20260916`, based on `origin/main` revision `7bd0256`, in the
`QuickVoice-seo-growth-20260916` worktree. The original modified checkout was not
overwritten. Existing GA4, TruConversion, pricing calculations, public resources,
and the exact-content publishing gate are retained.

Operating decisions: **US English**, qualified business enquiries as the primary
outcome, a dedicated growth team, and both delivered enquiries and confirmed
bookings reconciled into distinct prospects. A booking-link click is not a
booking. A delivered enquiry is not automatically qualified.

This report supersedes older preparation statements only for the work recorded
below. It does not claim that a release, GA administration change, customer
interview, outreach attempt, or 90 days of campaign execution has occurred.

## Implemented work

| Workstream | Change | Boundary |
|---|---|---|
| Existing visibility → relevant business pages | Nine task-specific article journeys, with contextual workflow, pricing, enquiry and resource paths. Related-guide selection prioritizes the same task over generic category recency. | Recommendations still exclude future, unreviewed or stale-review content. |
| Priority editorial links | Updated scheduling, IVR, multilingual, answering, property-management, Vapi-alternatives and Retell-alternatives articles. | Link-only edits retain the existing substantive `updatedAt`; review hashes are renewed for the actual final content. |
| Vapi evaluation | Rewrote and publication-reviewed `/blog/quickvoice-vs-vapi`: ownership, backend actions, migration, operating costs, and fit/not-fit; official Vapi and repository sources recorded. | No invented product test, savings, migration compatibility, feature parity or customer result. |
| Commercial clarity | Scheduling and property-management titles/headings now name the actual task. Open-source page explains implementation ownership. Pricing explains the wider operating budget and links the existing worksheet. | No unsupported calendar integration, automatic maintenance dispatch, free telephony or all-in cost claim. |
| Enquiry context | Optional UUID receipt, form location and coarse first-document source/landing path; SPA navigation preserves context in memory. Strict API validation and escaped internal email presentation. | No new persistent browser storage or visitor identity; no automatic country/qualification inference. Web forwarding stays legacy-compatible until explicitly enabled. |
| Measurement activation | Dry-run-first GA4 registration utility for `generate_lead` and three event-scoped CTA/form dimensions, with scope checks and read-after-write verification. | Existing grant is read-only. Registration was inspected, not changed. |
| Business outcomes | Offline scorecard reconciles verified enquiries, bookings, qualified prospects and opportunities; excludes tests, handles cancellations/reschedules, and reports unknown attribution separately. | No CRM/calendar integration or fabricated baseline. Source records and sales decisions remain required. |
| Reporting | Read-only US GSC/GA4 snapshots, separate property totals and reported brand/nonbrand queries, aligned 28/90-day comparisons, coverage warnings and private exports. | No hidden-query allocation, growth claims across tracking gaps, automatic report schedule or production lead submission. |
| Regression checks | Added offline reporting/measurement/scorecard tests to CI and package commands. Content, contact and attribution tests added. | Local checks are not hosted CI results. |

The nine configured article journeys are:

- `/blog/free-ai-appointment-scheduling-tools`
- `/blog/ai-appointment-scheduling-guide`
- `/blog/ai-voice-agent-vs-ivr`
- `/blog/multi-language-ai-voice-agents`
- `/blog/vapi-alternatives`
- `/blog/retell-ai-alternatives`
- `/blog/quickvoice-vs-vapi`
- `/blog/ai-phone-answering-service-small-business`
- `/blog/ai-voice-agents-property-management`

## Evidence and prioritization

The September 15 audit used DataForSEO US/English estimates as secondary demand
signals, alongside actual GSC query/page visibility and sparse GA4 acquisition
data. Scheduling has existing visibility to recover; IVR and multilingual pages
have narrower relevant query opportunities. Alternatives, open-source ownership,
answering and property-management journeys are commercial-intent tests, not
established organic lead sources. Large keyword-volume spikes and zero difficulty
values were not used to promise easy rankings or forecast revenue.

The refreshed September 16 snapshot completed **141 read-only requests without
errors**. Final GSC data ends September 14. August 18–September 14 US totals are
**8 clicks / 933 impressions**, versus **10 / 1,611** in the preceding 28 days.
Reported US nonbrand queries show **0 clicks / 373 impressions**, but returned US
query rows explain only four of the eight total clicks. The other four remain
unclassified, not assigned to brand or nonbrand.

GA4 recorded **8 US production-host Organic Search sessions, 4 engaged sessions,
and no `generate_lead` events** in that current period. Historical collection gaps
make a clean growth/conversion-rate comparison invalid. These are recorded
analytics observations, not evidence that no real enquiries existed. See
[reporting operations](reporting-operations.md) for exact filters, dates and
private-export locations.

The current production sitemap was already fetched by Google on September 15
without errors/warnings. It has **99 URLs**. The local candidate has **100 URLs**:
34 static pages and 66 reviewed articles, including the newly approved Vapi
comparison. No redundant sitemap submission was made. Retell, best-platforms,
automotive and ElevenLabs/Deepgram have historical GSC exclusions to recheck
after recrawl, not current observed HTTP/noindex defects. Synthflow remains
outside the sitemap until its own publication-time evidence review.

## Release and activation sequence

1. Review this branch and the final diff. Do not copy the unrelated modified
   original worktree into the release. Run the checks below on the merge candidate.
2. Deploy the **API receiver first**; it accepts both legacy and optional extended
   contact payloads. No database migration is introduced.
3. Deploy the web change with `CONTACT_ATTRIBUTION_ENABLED` still false unless
   the receiving endpoint has been verified compatible. Then enable the
   server-only flag and restart/redeploy web. For rollback, disable the flag
   before rolling back the API. External webhook owners must confirm support.
   Preserve existing production build/runtime variables, including
   `NEXT_PUBLIC_CONSOLE_URL`; localhost's default console hostname is not a
   requested production login-destination change.
4. Verify live content, canonical/robots, article journeys, downloads and the
   100-URL sitemap. Recheck www redirects without dropping path/query. Do not
   remove review gates to force sitemap growth.
5. In staging, verify failed delivery retains form input and emits no lead;
   acknowledged delivery emits one event and contains safe context in the
   receiving record. A single authorized, clearly marked production QA enquiry
   must separately verify provider acknowledgement and inbox placement. Exclude
   it from business outcomes. No live enquiry was sent for this implementation.
6. An authorized GA administrator supplies an appropriately scoped existing
   credential and runs the documented explicit apply command. Verify collection
   and registration separately. Do **not** reinstall the working tag or enable
   manual pageviews without completing the existing pageview rollout checklist.
7. Assign named growth, engineering, analytics and sales owners. Reconcile real
   inbox/calendar/sales records privately; unknown booking source gets no organic
   credit. Establish the first clean 28-day baseline only after measurement works.

Contact details, rollout limitations and timeout ambiguity:
[contact runbook](contact-delivery-operations.md). GA activation and scorecard:
[measurement runbook](measurement-operations.md).

## Checks

Run from this worktree's root:

```sh
pnpm --filter web lint
pnpm --filter web check-types
pnpm --filter web test
pnpm --filter server exec tsx --test tests/mailer.test.ts tests/contact/*.test.ts
pnpm --filter server check-types
pnpm --filter server build
pnpm test:seo-operations
node --test tests/*.test.mjs
pnpm claims:audit:seo
pnpm --filter web build
git diff --check
```

### Recorded verification

| Check | Result |
|---|---|
| Web tests | 64 passed |
| Server contact and mailer tests | 14 passed |
| Offline SEO operations tests | 43 passed: snapshot 15, GA setup 13, scorecard 15 |
| Root repository tests | 75 passed |
| Web lint and web/server type checks | Passed |
| Web production build and server build | Passed |
| Campaign public-claims audit | 190 files passed |
| Final production-build HTTP crawl | 100 sitemap URLs: all 200, indexable, self-canonical, one H1, nonempty title/description |
| Malformed attribution metadata against final built API | Object/array form locations safely omitted; valid location accepted; all three synthetic requests acknowledged by local stub |
| Diff whitespace check | Passed |

Playwright verified all nine journey panels and the absence of one on the pending
Synthflow page; actual scheduling navigation; pricing/resource/ownership anchors;
desktop and 375px mobile layouts, including dark/reduced-motion Vapi checks. No
horizontal page overflow was observed and journey controls were at least 44px
high. Form QA verified retained text and focused error feedback after a rejected
local delivery, the same receipt on a manual retry, one local receiver request
for synchronous duplicate submits, and one mocked `generate_lead` after success.
Its payload contained only method, form location and page path, not receipt or
contact fields. The successful form state was visually inspected.

Browser QA used a local production build, a localhost-only mail receiver,
synthetic data, and blocked external Analytics/session-recording/scheduling
requests. Expected console errors were the blocked external script and simulated
delivery rejection, not a claimed clean production console. Final HTTP evidence
is in ignored `output/seo/2026-09-16/local-release-smoke.json` (0600); browser
artifacts are local-only under the same dated output directory. These checks do
not establish real provider delivery, live GA collection, real bookings, field
Core Web Vitals or ranking effects. They are scoped checks, not a claim that every
monorepo service, Docker image or hosted CI job was tested.

## Remaining campaign execution

Use [growth-backlog-2026-09-16.csv](growth-backlog-2026-09-16.csv) as the active
priority overlay on the original calendar. Relative days begin at the actual
verified release, not this document's creation date. The historical review queue,
calendar and September 6 evidence remain intact.

Weekly: inspect the US nonbrand query/page changes, organic landing pages and
verified business outcomes; choose one improvement with a written hypothesis.
At days 30/60/90, review raw counts, coverage, qualification and opportunities.
Compare like-for-like complete windows and avoid statistical certainty at this
sample size. Promote the clusters producing credible buyer engagement; narrow or
pause clusters producing irrelevant enquiries. No fixed traffic, rank, lead or
revenue target is asserted as an achieved result.
