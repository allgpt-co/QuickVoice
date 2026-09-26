# US property-management SEO: execution and evidence gates

## Objective and fixed page ownership

Build a measurable path from US residential property-management search intent to **verified, relevant business enquiries**, without presenting QuickVoice as a turnkey outsourced answering service or inventing customers, integrations, savings or results. Target leasing enquiries, routine information collection and documented human handoff. Emergency decisions, tenant eligibility decisions and unsupported system writes are not automated capabilities to imply.

| Canonical path | Owned intent / role |
|---|---|
| `/industries/real-estate` | Commercial property-management workflow destination; preserve its existing URL rather than create a competing sector hub |
| `/blog/ai-voice-agents-property-management` | Implementation/workflow guide and limitations |
| `/blog/property-management-answering-services` | Evaluation of human, outsourced and operator-managed AI answering approaches |
| `/blog/after-hours-leasing-call-handling` | Bounded after-hours leasing intake and verified handoff |
| `/blog/property-management-answering-service-cost` | Cost inputs, assumptions and operating responsibilities, not an invented customer savings figure |
| `/blog/property-management-phone-agent-integration-checklist` | Read/write boundaries, integration validation and ownership checklist |
| `/resources/property-management-call-intake` | Useful intake resource and evaluation next step; a resource interaction is not a qualified lead |

These seven paths form the reporter's exact acquisition-page cohort. The commercial CTA goes to the existing contact flow, with the relevant workflow context; the contact URL itself is not added to the sector **landing** cohort. Search query intent, page membership, consented GA sessions and verified sector prospects are different classifications.

**Approved targets, not forecasts or guarantees:** complete **five property-manager interviews**; by Day 90 reach **10 reported US nonbrand property-management clicks in the latest complete rolling 28-day window** and **one verified qualified organic property-management business enquiry** during the campaign. Measure clicks using the exact seven-page, US, reported-nonbrand cohort below; anonymous query identity stays unknown and is not credited to that target. Verify the enquiry's sector, US business relevance, qualification and organic acquisition privately rather than inferring them from a CTA or GA event. Record actual progress and measurement limitations even when a target is missed.

## Operational status: do not confuse implemented assets with external outcomes

| Deliverable / evidence | Current treatment and owner |
|---|---|
| Exact GSC/GA cohort and read-only index inspections | Implemented in `scripts/seo-snapshot.py`; unit-tested locally. Growth ops must activate the merged source revision in the existing private report. |
| Seven public pages/resource and their release | Engineering/content owners verify the merged revision, live responses, metadata and cross-links; local branch assets alone do not establish deployment. |
| Search/index baseline | [September 26 baseline](property-management-baseline-2026-09-26.md) preserves the older broader-cohort audit. First **exact seven-page** report remains pending. |
| Property-manager interviews | **Pending; target five completed interviews:** growth/product owners recruit and obtain participation permission; collect terminology, recurring call types, decision criteria, system boundaries and evaluation objections privately. No interview findings or quotations have been fabricated. |
| Thirty-call pilot and demonstration | **Pending:** operator executes approved synthetic scenarios in a real configured test environment, retains allowed recording/record evidence, and reviews outcomes. A fixture, script, checklist or unit test is not a completed call run. |
| Contact receiver, receipt and actual inbox arrival | **Pending verification:** hosting/engineering owner confirms compatible receiver and safe flag rollout; authorized inbox owner confirms one clearly marked QA message. HTTP 200/provider acknowledgement alone is insufficient. |
| Indexing request | **Not performed:** authorized SEO owner may use Search Console after meaningful live changes are verified. The script only reads URL Inspection snapshots. |
| Real customer story/results | **Pending:** customer agreement, actual evidence and explicit publication permission. Synthetic demos must remain labeled as synthetic, not customer proof. |

GA's `generate_lead` and three custom dimensions are already correctly configured as of the latest audit. No GA administrative changes or replacement property are required here. Preserve consent behavior and the existing pageview ownership settings. Existing read-only credentials remain in secure environment storage; no new scope or secret is needed for reports.

## Weekly operating procedure and release gates

Use the existing Monday **14:17 UTC** private workflow and its existing coordinator, not another scheduler. The source revision pin must advance **after** the reviewed public reporting change merges; see [reporting operations](reporting-operations.md). The reporting owner checks that the first extended run actually includes the sector cohort and seven inspections. A scheduled run is not a completed human review.

Each weekly review records its reviewer/date, source revision, windows, observed facts, unresolved gates and one next action:

1. **Collection gate:** API failures stay errors/unknown; check final GSC date, GA timezone/lag, row limits and missing daily rows. Annotate actual releases and the verified consent cutover when obtained. Do not call September 21 a confirmed production deployment date or treat unlike measurement regimes as a growth experiment.
2. **Release/index gate:** verify only the changed/published target pages are 200, indexable, self-canonical, linked internally and in the sitemap. Compare live responses with Google's indexed snapshot/crawl time; do not “fix” an already-removed noindex based on an old crawl. New unknown URLs are not an API failure. Request recrawl separately only when justified; do not resubmit unchanged sitemaps every week.
3. **Search gate:** inspect US exact-page totals, independent reported-nonbrand totals, query-page ownership and anonymized coverage. Inspect whether the guide, services comparison, cost and workflow pages satisfy distinct intents. Do not sum incomplete query rows as the cohort total or identify hidden queries as nonbrand. Resolve competing page intent with explicit content/internal-link adjustments, not mass keyword pages.
4. **Journey gate:** review consented US organic landings, engaged sessions and downstream events for the same landing cohort. Check observed resource/CTA behavior without calling a click an enquiry. If page impressions grow without relevant clicks, review intent/snippet clarity before publishing more pages; if clicks grow without verified enquiries, inspect message/offer/handoff and measurement separately.
5. **Sales gate:** sales reconciles received enquiries, booked meetings, qualified prospects and opportunities privately. Identify the US property-management segment from verified business records, never from IP country or article visitation alone. Record unknown-source bookings as unknown. Keep tests, duplicate receipts, reschedules and cancellations out of inflated counts.
6. **Evidence gate:** publish only capabilities and proof actually established. Do not publish a recorded customer call, benchmark, customer name, quote or percentage without the supporting record and the required permission. Make one documented content/journey improvement and check it on the next comparable review rather than attributing every change to SEO.

### Thirty-call validation before performance/demo claims

Use the **existing canonical manifest**, not a second scenario taxonomy: `PROPERTY_BENCHMARK_CATEGORIES` in the [resource source](../../../apps/web/data/property-management-resource.mjs), surfaced by the [intake resource](/resources/property-management-call-intake#synthetic-benchmark) and its generated [30-case scorecard](/resources/property-management-benchmark-scorecard.csv). It defines **ten categories with three cases each**, `LEASE-01` through `LEASE-30`: routine leasing enquiries; property identification; unavailable or stale listing facts; corrections and conversational variation; time preferences are not bookings; private information and unnecessary collection; screening and housing decisions; urgent and maintenance diversions; requests beyond the permitted scope; and record delivery and staff ownership. Preserve those case IDs, expected behaviors and severities, and record the exact manifest/build revision before execution. Outcome fields remain blank until observed. Use synthetic properties/people and consenting test staff. The system under evaluation and each actual adapter must be named; a mocked adapter cannot establish a production integration.

For every scenario retain a private ID, expected outcome, actual outcome, build/config revision, timestamp, permitted audio/transcript reference, tool/handoff record reference, and reviewer verdict. Do not place recordings, tenant details or raw conversations in public Git or GA. Tests must establish whether an intake record or handoff actually reached the expected destination, not merely whether an agent said it did.

**Gate:** apply the [checked-in pilot checklist](../../../apps/web/public/resources/property-management-pilot-checklist.md) to all 30 canonical cases. Any critical failure or untested critical path blocks expansion/performance claims/demo approval until corrected and rerun; blocked is not a pass. Unsafe disclosure, an eligibility decision, false booking/dispatch or missing urgent fallback is critical even when a scenario was initially classified standard. Verify actual records, destination receipt and staff acknowledgement separately; claimed-but-undelivered handoffs are not successful outcomes. Count outcomes from records, not a scripted demo transcript. This is a planned acceptance process, **not a report that 30 calls have passed**. Live run, permission, recordings and output-record verification remain external work.

## Private prospect scorecard: preserve the strict schema

Use the existing [header-only template](lead-scorecard-template.csv) and [measurement runbook](measurement-operations.md). Do **not** add `industry`, company names, property addresses, unit counts, tenant data or new identifying analytics parameters to the scorecard.

The sales owner selects verified US residential property-management prospects in the private CRM, using an opaque internal prospect ID. Export **all stage/version history for those selected prospect IDs**, not just rows whose landing page is one of the seven. This preserves test flags, cancellations and original booking IDs. The original acquisition path stays unchanged, even when outside the SEO page cohort; unknown source remains unknown. Selection is a private CRM/export operation, not a new field in the strict ten-column CSV and not automatic GA segmentation.

```sh
# A private, already-verified sector export; dates must reflect the actual review.
python3 scripts/seo-lead-scorecard.py output/seo/property-management-outcomes.csv \
  --start 2026-09-26 --end 2026-10-23 --as-of 2026-10-24T12:00:00Z
```

The command is illustrative, not evidence that this future review or any outcomes occurred. Count distinct prospects per stage; neither stage counts nor landing-page breakdowns are additive. No conversion rate is produced by dividing CRM prospects by consent-biased GA sessions. Source attribution requires corroborated acquisition context; an article path or a prospect's later organic visit does not establish first acquisition. Maintain private evidence for sales qualification and opportunities; do not emit those stages from a browser CTA.

## Ninety-day milestones, measured from verified live release

| Milestone | Required deliverable and decision |
|---|---|
| Days 0–14 | Confirm reviewed live release and source-pin activation, establish exact-cohort baseline, inspect indexing, assign receiver/inbox and interview owners, and prepare/freeze the synthetic 30-call manifest. Gate unsupported demo/result claims until real evidence exists. |
| Day 30 | Review index state and first measured query/page coverage; publish the first documented content/journey refinement. Record interview and 30-call status honestly; completed-call evidence must include record/handoff verification. Confirm that actual enquiries can be privately reconciled; unknown-source bookings remain separate. |
| Day 60 | Compare like-for-like complete windows without masking consent/indexing changes. Refine the winning relevant intents using observed US search and verified enquiry objections. Keep comparison/cost pages accurate and publish permitted real proof only if obtained. Do not add an unrelated industry simply to increase URL count. |
| Day 90 | Check progress against the targets of 10 reported US nonbrand property-management clicks in the latest complete rolling 28 days and one verified qualified organic sector enquiry during the campaign; report the actual values and evidence limitations, not an inferred success. Growth and sales jointly decide **expand, iterate or stop** using index coverage, relevant query/click progression, enquiry quality, opportunity evidence and operating effort. Record the rationale and next experiment. No traffic, ranking, lead or revenue total is guaranteed. |

These are execution/review commitments, not completed tasks or promised growth. Delay a proof-dependent action when its evidence is unavailable; continue useful technical/content work without inventing results. The existing home-services challenger remains outside the exact property-management cohort and requires its own evidence-backed decision before expansion.
