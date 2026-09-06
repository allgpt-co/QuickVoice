# Remaining marketing and scenario review — 2026-09-06

Scope: the 22 marketing routes and 33 illustrative scenarios in the approved review queue. Reviews cover visible content, metadata, structured data, imported local components and any Markdown loaded by the route. Individual rows below record completed review decisions; this document does not claim that unfinished rows or deployment are complete.

## Evidence used

- [Repository README and setup boundaries](../../../README.md): inspectable application, active-development status and real-call provider prerequisites.
- [MIT license](../../../LICENSE): source licensing, separate from hosted/service costs.
- [Live MCP handler](../../../apps/ai/handlers/mcp_handler.py): marked write/side-effect tools are excluded/rejected by the default live path. A caller request does not enable an action.
- [Workflow template](../../../apps/web/src/components/seo/workflow-page.tsx): visible FAQs and FAQ schema share the same text; canonical/OG/Twitter metadata derive from the route data.

No customer outcome dataset, certification evidence or named business-system connector proof was available for the claims removed from the first batch. Original component and Markdown claims were reviewed as historical marketing content, not accepted as evidence.

## Individual dispositions

| Route | Decision and findings | Evidence / state |
| --- | --- | --- |
| `/industries/hr-recruiting` | Rewrote for candidate enquiries, interview availability and HR callback requests. Removed the unsupported Olivia product, bias-free screening claims, automated hiring decisions, survey/ROI/customer figures, certification language and assumed ATS/calendar integrations. Replaced rendered legacy sections and refreshed the companion industry guide. | README/setup, MCP handler; [reviewed route data](../../../apps/web/data/industry-workflows.ts). Human decisions, accommodations and verified writes are explicit. Locally verified; deployment pending. |
| `/industries/saas` | Rewrote for onboarding questions, support intake and renewal callbacks. Removed fabricated retention/conversion gains, DPA/BAA/certification assertions, automatic jurisdiction handling and native CRM/support/billing integrations. Refreshed the companion guide. | README/setup, MCP handler; reviewed route data. Tenant-specific reads and account mutations require verified authorization. Locally verified; deployment pending. |
| `/industries/automotive` | Rewrote for service/test-drive requests, current vehicle information and staff follow-up. Removed unverified dealer counts, no-show/ROI gains, quoted plan costs, compliance badges and named prebuilt DMS connectors. Refreshed the companion guide. | README/setup, MCP handler; reviewed route data. No booking, vehicle availability, finance decision or appraisal is invented. Locally verified; deployment pending. |

Legacy section components for these routes remain in the repository but are no longer imported or rendered by the reviewed routes. The campaign audit follows the active dependency graph; reintroducing unsupported legacy sections would place their claims back in scope. The companion Markdown files were corrected even though the new route uses the shared workflow layout directly.

The remaining 19 marketing routes and all 33 scenarios are awaiting their individual pass at this batch boundary. Legal policy meaning will be retained unless supported by actual implementation or an established policy; unresolved legal/policy facts require an identified owner decision.

## First-batch verification

The three priority industry routes passed 27 web tests, web lint/type checks, the production build and the expanded campaign audit (76 files). Local production HTTP checks confirmed status 200, each route canonical, one H1, FAQ schema, provider/write boundaries and absence of the retired sample claims. Build ID: `ya_RJ8CgRhCH7ZLp0GVJV`. No deployment or real call was made. The inventory retains 156 rows and now uses LF line endings.
