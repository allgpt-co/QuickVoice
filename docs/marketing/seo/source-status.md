# Source, status, and dependency tracker

Prepared 2026-09-06; current follow-up checked 2026-09-20. The [September 18 completion record](completion-2026-09-18.md) records the live content release, active private reports, and remaining access blockers. The older [execution report](execution-2026-09-06.md) remains historical evidence. Status vocabulary: **locally verified** = implementation passed the recorded local checks, with deployment still pending; **prepared** = usable local asset exists; **pending verification** = implementation or measurement needs a recorded check; **scheduled** = future work; **blocked by evidence/access** = required external input unavailable; **superseded** = historical recommendation conflicts with current evidence.

## Governing sources

| Source | What it establishes | Treatment |
| --- | --- | --- |
| [SEO & Inbound Guide](https://docs.google.com/document/d/1BP2S5TRwgcOC0SFuriXWCNEtzv4LNVSxgDdoU3-zuyU/edit) | Keywords, technical SEO, useful content, distribution, reviews, nurturing, and reporting. | Adapt into this finite preparation package plus recurring 90-day execution. No completion markers in original. |
| [Website Blueprint](https://docs.google.com/document/d/11qs2RxaK9OEiEL_h43HC-eo5fk2hKiSP7rI3BVQZKc8/edit) | Industry/use-case journeys, related content, Phase 2 regular articles and first customer stories. | Preserve buyer intent and existing routes; verify claims rather than copy old examples. |
| [Trust Audit](https://docs.google.com/document/d/137GTVYuN_V3XX1U3zE_HD0kLY8Hgalips3WxxI2DztA/edit) | Initial 2–3 real stories, demos, resources, cost evaluation, and credible business evidence. | Three story templates prepared; real stories blocked by evidence and permission. |
| [AI Agent Use Cases](https://docs.google.com/document/d/18j6RKJAnrEOQHZyKD7MQVv48BCZ2qBb2Jcmx8jFGGI4/edit) | Historical market/topic research. | Its cited case studies concern third parties. It proves no QuickVoice customer result. |
| [Current README](../../../README.md), [LICENSE](../../../LICENSE), [positioning](../../positioning/core-positioning-framework.md) | Inspectable software, MIT license, setup and provider boundaries. | Current product facts take precedence over historical aspirational marketing. |
| [Public claims gate](../public-claims-gate.md) | Evidence requirements for public claims. | Use current LICENSE if a historical license sentence differs. Never infer certification, savings, or customer approval. |

## Work and ownership

### September 20 follow-up

[Current verification](follow-up-2026-09-20.md): all four GA registrations exist;
there are no missing registrations to create. The API still reports a USD 1
key-event default, requiring correction on the existing event. Hosting read
permission remains denied. The 101-URL live crawl and intercepted form/pageview
checks pass; actual receipt/inbox/GA collection and consent behavior are separate
unverified outcomes. Existing Monday reporting is reused. One IVR clarification
is prepared privately and held behind the deployment/attribution gates.


### September 18 completion release

The [completion record](completion-2026-09-18.md) tracks the current release,
overdue Synthflow review, private reporting automation, and measurement
activation. Its dated observations supersede preparation and candidate statuses
below only where completion evidence is recorded.

| Work | September 18 status | Remaining dependency |
|---|---|---|
| Nine article journeys; Vapi and Synthflow reviews; commercial clarity | Merged and publicly verified; all 101 sitemap URLs pass | Google recrawl/indexing is monitored separately. |
| Contact receipts and source attribution | Code merged; backend release workflow completed; flag activation pending | Coolify explicitly denies API read permission; receiver health/configuration must be verified before activation. |
| Marked production enquiry, inbox and GA receipt | Pending activation; no September 18 enquiry sent | Hosting access, enabled attribution and destination inbox verification. |
| GA key event, three event dimensions and manual pageviews | Utilities tested; automatic pageviews remain configured | Existing grant lacks `analytics.edit`; secure administrative access still required. |
| Private weekly US GSC/GA reporting | Active Mondays 14:17 UTC; first hosted run passed 141 requests | Human review and independently verified sales outcomes remain recurring work. |
| Future campaign work and customer proof | Scheduled or evidence-dependent | Preserve real evidence, consent and sending boundaries. |

### Historical September 16 implementation overlay

See [implementation-2026-09-16.md](implementation-2026-09-16.md). This table preserves the
September 16 candidate state; use the completion table above for current status.

| Work | Current status | Next dependency |
|---|---|---|
| Nine article journeys; reviewed Vapi comparison; commercial clarity | Locally verified, deployment pending | Reviewed release; live metadata/link checks. Candidate sitemap 100 URLs versus current live 99. |
| Enquiry source/landing context and receipts | Locally implemented; production forwarding disabled by default | Deploy compatible API first, then enable web `CONTACT_ATTRIBUTION_ENABLED`; verify a marked QA enquiry separately. |
| GA4 `generate_lead` key event and CTA/form dimensions | Utility tested; blocked by edit access | September 16 existing OAuth grant has `analytics.readonly`, not `analytics.edit`; no registrations changed. |
| US GSC/GA reporting | Live read-only run verified; weekly scheduling not configured | 141 successful requests, final GSC through September 14; operator owns recurring private snapshots. |
| Confirmed bookings and qualified business outcomes | Offline reconciliation tool tested; actual source records required | Sales supplies verified private records; unknown source gets no organic credit. |
| DataForSEO demand validation | US/English keyword and SERP research completed during September 15 audit | Directional prioritization only; volume spikes/difficulty zeros are not a reliable ranking or pipeline forecast. |
| Production GA collection | Tag already present; historical gaps remain | Do not reinstall or claim clean historical conversion rates. New lead flow still needs deployment and end-to-end verification. |
| Days 1–90 execution, real demonstrations, stories and distribution | Scheduled or evidence-dependent | Use the active growth backlog; record actual owners, dates and source evidence. |

### Historical September 6 release and preparation state

**Updated 2026-09-06:** Search Console is active; the authorized sitemap submission has been processed without reported errors or warnings. The deployed website now loads the verified GA4 tag. `generate_lead` key-event registration and manual page-view activation still require the missing Analytics edit access. The current hosting API is accessible, and the contact backend has been deployed. See the [execution report](execution-2026-09-06.md) for web rollout and delivery evidence; the earlier [live measurement check](live-measurement-check-2026-09-06.md) is historical diagnosis.

The following table preserves the state **at preparation**, before the later implementation batches. Use the execution report and individual inventory decisions for current status.

| Work | Status at preparation | Owner role | Completion evidence / next action |
| --- | --- | --- | --- |
| 90-day runbook, full inventory, intent map | Prepared | Marketing lead | Files in this folder; individual content decisions still pending. |
| 12 article revisions and campaign pages | Locally verified; deployment pending | Content editor + web engineer | [Verification report](verification-2026-09-06.md); 12 current source reviews; homepage and six workflow routes refreshed; contact/pricing/open-source funnel checked. |
| Sitemap/indexability correction | Locally verified; deployment pending | Web engineer | Production build serves 45 indexable sitemap URLs: 33 static routes and 12 reviewed articles. All pass HTTP metadata checks; illustrative details and unreviewed articles excluded. |
| Enquiry conversion measurement | Local behavior verified; GA activation pending | Analytics owner | `generate_lead` on confirmed delivery only. Local mocked success/failure verified 2026-09-06; production webhook and actual GA collection remain unverified. GA4 key-event registration requires analytics edit scope, unavailable in the connected read-only token. |
| GSC baseline access | Available | Analytics owner | `sc-domain:quickvoice.co`; OAuth includes read/write scope. A write-capable token is not proof that anything was submitted. |
| GA4 baseline access | Available, limited historical coverage | Analytics owner | Property `543950329`; read-only scope; created 2026-07-02. Changes to GA administration require the appropriate account access. |
| Keyword demand validation | Partial | SEO owner | GSC historical data available. Search-volume/difficulty subscription data not acquired; intent map carries no invented scores. |
| 12 posts, 3 nurture drafts, walkthrough script, checklist, cost worksheet | Prepared | Marketing lead + product expert | Review destination status before using; recording and email sending remain scheduled. |
| 20 distribution opportunities | Researched; unsent | Outreach owner | Primary rules and tailored pitches in CSV. Actual account availability, existing-listing duplication, and permission to send need confirmation. |
| Two directory listing packages | Prepared, unsent | Maintainer | OpenSourceAlternative eligibility boundaries and AlternativeTo public-availability review remain visible. |
| Real customer stories | Blocked by evidence | Customer-success owner | Obtain aggregate baseline/results, scope, attribution, customer review and publication permission. |
| Reviews and partner listings | Scheduled; conditional | Customer-success / partnerships owner | Genuine customers and verified partner relationship required. Never invent reviews, submit on customers' behalf, or imply a partnership from using an API. |
| 78 other blogs and 33 scenarios | Scheduled review | Content editor | Batch decisions and source review; retain noindex where unreviewed. |
| Production deployment and live verification | Pending deployment access | Web/release owner | Deploy this reviewed change, configure an accepting `CONTACT_WEBHOOK_URL`, then verify live host redirects, metadata, sitemap and an authorized end-to-end enquiry. No release was made from this workspace. |
| Days 1–90 publishing, outreach, and reporting | Scheduled | Named operational owners to be assigned | Log actual dates and evidence URLs. No future activity is complete yet. |

## Superseded historical assumptions

The old two-minute/no-code promise, fixed ROI or conversion gains, claimed certifications, customer counts, partner badges, fixed language counts, and undocumented calendar/EHR/CRM integrations are not approved facts. Current infrastructure still requires configuration and provider accounts. Old SEO promises about specific rich-result appearances must be checked against current search-engine documentation and relevant visible content; schema is not a promise of a particular result display.

The original program includes paid promotion, review campaigns, webinars, and community building. This package supplies preparation and a schedule; it does not authorize spend, fabricate proof, publish an unfinished demo, or send any message. A blocked story can stay blocked while the educational program continues.
