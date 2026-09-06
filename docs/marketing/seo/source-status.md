# Source, status, and dependency tracker

Prepared 2026-09-06. Status vocabulary: **locally verified** = implementation passed the recorded local checks, with deployment still pending; **prepared** = usable local asset exists; **pending verification** = implementation or measurement needs a recorded check; **scheduled** = future work; **blocked by evidence/access** = required external input unavailable; **superseded** = historical recommendation conflicts with current evidence. No external action is recorded as completed here.

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

**Live recheck, 2026-09-06:** Search Console is active and the homepage is indexed. GA4's property exists, but its tag is absent from the tested live pages; the latest recorded activity is August 11. Restore and verify the production build's Analytics configuration before treating measurement as live. The new `generate_lead` event is also not registered as a key event. See the [live measurement check](live-measurement-check-2026-09-06.md). The subsequent authorized code repair now supplies the verified ID on QuickVoice’s own domains; deploying it is pending because the connected Coolify endpoint is unreachable.

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
