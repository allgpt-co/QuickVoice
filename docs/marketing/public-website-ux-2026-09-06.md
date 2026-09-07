# Public website UX implementation and verification

Implementation: 2026-09-06. Final verification: 2026-09-07 UTC. Source baseline: `4243b0b03388ad3ed845f24ac6a7f23a1a4b7ea5`.

## Scope and decisions

This implements the approved public website redesign. Business enquiries are the main objective, using a clean product design that retains QuickVoice and its blue identity. The primary business action is **Book a demo**, linking directly to `https://tidycal.com/team/quickvoice/demo`; **Contact the team** opens `/company/contact`. The console and documentation applications remain outside this redesign.

## Implemented work

1. **Foundation:** shared spacing, typography, buttons, cards, form controls and reading styles; a blue/slate light theme and blue/navy system dark theme; one focusable main landmark and working skip link; visible content without animation or JavaScript prerequisites.
2. **Homepage and navigation:** five main navigation sections, explicit desktop disclosures, a native modal mobile menu with focus containment/restoration and complete scrolling, grouped footer links, a concise business homepage and a labelled HTML call-workflow illustration. The animated globe, outcome-metric dashboard artwork and repeated mission sections are no longer imported by the homepage. Visible homepage FAQ content also generates its schema.
3. **Business journeys:** shared workflow and information-page layouts, demo actions, readable pilot evaluation tables, human handoff and implementation boundaries, and contextual links into pricing, resources and guides. Healthcare, financial services and deployment-review pages retain their factual boundaries.
4. **Editorial and resources:** twelve reviewed guides per page; working GET search, topic filters, result counts, empty states and pagination; consistent visible taxonomy; shared Markdown heading/fragment transforms and contents links; presentation-only duplicate-title removal; downloads immediately after the resource introduction; readable, ungated source documents.
5. **Evaluation and company pages:** actual usage-cost formula, conditional signup-credit wording and self-hosted cost explanation; MIT license copy including the generated social image; consistent scenarios, company, legal, contact, error and not-found layouts. Scenario indexing metadata and operative legal text remain intact.
6. **Contact and measurement:** one form with shared client/API normalization and validation, existing field limits enforced without silent truncation, focused errors, persistent feedback and an explicit reset. Pending submissions freeze inputs and prevent duplicate sends. `generate_lead` still requires acknowledged delivery. CTA classification matches origin and path, omits query/fragment data, and treats demo clicks as intent rather than completed bookings.

No content Markdown, publication dates, review fingerprints, downloadable resource files, database schema, billing implementation, console code, deployed console URL override, or Google Analytics pageview guard was changed.

## Editorial rules

| Display topic   | Existing source categories                     |
| --------------- | ---------------------------------------------- |
| Getting started | Guides; AI Voice Agent Education               |
| Workflow guides | Use Case Guides; Use Case Deep Dives           |
| Industry guides | Industry Guides; Industry Playbooks            |
| Implementation  | Implementation Guides; Implementation & How-To |
| Comparisons     | Comparisons                                    |
| Costs and ROI   | ROI & Business Case                            |

`/blog` retains `q` and adds `topic` and `page`. Search/topic variants are noindex/follow with `/blog` as canonical. Unfiltered pagination is indexable with its own canonical URL. Invalid or out-of-range pages return the not-found experience. The sitemap remains limited to the existing approved publication set.

## Verification

- Web lint, type checking and optimized production build passed.
- All 52 web tests and 40 root tests passed. New behavioral coverage exercises contact validation/delivery, CTA origin matching, topic/pagination metadata, heading transformations and fragment links.
- Claims audit passed across 186 reachable public-content files. Dependency audit passed with the repository's existing suppressions unchanged.
- Full source-derived crawl verified the expected statuses for 157 routes: 66 published articles (65 reviewed/indexable), 24 unavailable articles, 33 illustrative scenario details and 34 static routes. The 99-URL sitemap matched exactly. All 10,076 rendered internal-link occurrences and 195 Markdown-link occurrences resolved; 47 FAQ schema questions/answers were visibly present.
- All 65 reviewed articles passed a DOM audit: correct single H1, no duplicate opening title, 838 matching contents links, unique IDs, and preserved publication dates, canonicals and indexability.
- Core homepage/workflow/regulated-page checks covered 320, 390, 768, 1024, 1440 and 1920 CSS pixels. Secondary-page checks covered twelve routes at 320/390/1440 light and 390 dark, plus desktop dark and keyboard interactions. Checked pages had no page-level horizontal overflow and one main/H1.
- Read-only checklist inputs have accessible names derived from their own task text, including nested tasks. Primary button hover states use a solid darker blue; legal links retain full text contrast on hover.
- Wide editorial tables use minimum cell widths inside a labelled, keyboard-focusable scrolling region, preserving readable text on phones. Topic navigation remounts the search form so its displayed values match the URL.
- Keyboard checks covered skip navigation, desktop disclosure dismissal, mobile Escape/focus restoration, focus wrapping, and full menu scrolling at 568×320. The homepage and workflow page remain readable without JavaScript. Reduced-motion and light/dark presentations were checked.
- Automated accessibility checks found no WCAG A/AA violations in the tested homepage, workflow and regulated-page views after fixes. Invalid contact fields, desktop delivery errors and mobile delivery errors also passed without violations or incomplete checks. These checks support the release; they are not a claim of exhaustive accessibility certification.
- Mocked contact tests covered success, validation, unavailable delivery, provider failures, malformed responses, network failure, duplicate clicks, retained values, persistent feedback, no premature lead event and one acknowledged lead event. No production enquiry was sent for this redesign.
- Privacy and terms preserve all 284 operative JSX text nodes and their metadata. Reviewed resource hashes remain protected by the resource-manifest test.

## Performance measurements

Three mobile Lighthouse runs used the same Lighthouse configuration and Chromium executable. The baseline was the unchanged live website; the redesign measurement used a local optimized production build. Network paths therefore differ, and one baseline run reported slow host CPU. These results are lab diagnostics, not field Core Web Vitals or a controlled conversion experiment.

| Metric                   | Live baseline median | Redesign production-build median |
| ------------------------ | -------------------: | -------------------------------: |
| Performance              |                   71 |                               95 |
| Accessibility            |                   96 |                              100 |
| Largest Contentful Paint |              2.964 s |                          2.420 s |
| Total Blocking Time      |           1,213.5 ms |                         175.1 ms |
| Cumulative Layout Shift  |                    0 |                                0 |

The redesign performance runs scored 94, 96 and 95, exceeding the planned median-90 target. Field goals remain LCP ≤2.5 s, INP ≤200 ms and CLS ≤0.1 when sufficient field data exists. Post-release evaluation should compare complete traffic windows for demo intent, acknowledged enquiries and resource engagement; no uplift is promised.

Local evidence is stored under the isolated checkout's `output/playwright/`, `output/lighthouse/`, and validation logs. The release PR records CI and deployment verification. Google Analytics admin permissions, policy-owner confirmations, customer evidence and future marketing campaign operations remain separate workstreams.

## Existing framework limitation

Unavailable dynamic blog URLs return HTTP 404 and noindex, but Next.js initially sends its error shell; the custom recovery page appears after hydration. The same behavior was confirmed on the unchanged production site, including an unknown blog slug. Generic unknown routes render their recovery page in the initial HTML. The strict crawler retains 48 initial-main/H1 findings across 24 unavailable articles, while their status, indexing and hydrated recovery checks pass. This release preserves publication timing and ISR behavior; it does not freeze future routes or alter framework routing to mask that existing limitation.

## CI date-boundary correction

The UTC date changed during verification. The root configuration test had compared a date-only security exception expiry with the current timestamp, while the existing dependency auditor treats the expiry date as inclusive. The test now invokes the auditor's own suppression-only check with today's UTC date. A boundary regression verifies acceptance on the expiry date and rejection the following day. No security exception date, audit severity, package version or audit enforcement rule was changed.

The date transition also made one previously scheduled, unreviewed guide readable under the unchanged publication rules. It remains noindex and outside the sitemap. Final verification therefore has 66 readable articles, 65 reviewed/indexable articles and 24 unavailable articles; the sitemap still has 99 URLs.
