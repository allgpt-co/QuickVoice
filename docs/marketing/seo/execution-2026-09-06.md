# SEO implementation and release record — 2026-09-06

This record supersedes preparation-time deployment/access statements in the original package. The user authorized implementation, commits, pull requests and merges to `main`, production contact delivery to `info@quickvoice.co`, GA administration once edit access is connected, and the selected owned-channel/opt-in distribution program. Authorization does not establish account access, delivery, publication or future outcomes.

## Completed releases and observations

| Work | Recorded evidence |
| --- | --- |
| Analytics restoration and publishing controls | PR 181 merged. The deployed QuickVoice domain loads the verified `G-SZFBG11VRP` tag. Source reviews are tied to article content; unreviewed and future publication boundaries remain enforced. |
| Client-navigation page-view coordinator | PR 183 merged; required CI checks passed. Local initial/path/query/back/forward checks passed. Manual activation remains off while GA enhanced measurement still handles browser-history changes. |
| Website-to-inbox delivery implementation | PR 182 merged; required CI checks passed. The production API image `sha-7a21a2e26a2ec0267f839a239c30b23cc00848fe` finished deploying at 09:43:20 UTC. Health returned 200 and an unauthenticated contact-delivery request returned 401. The web and API have the same dedicated runtime secret; web forwarding uses the direct HTTPS endpoint. The single synthetic enquiry below received provider acknowledgement and visible website success; destination-inbox confirmation remains pending. |
| Public buyer resources | PR 186 merged after all CI checks passed. On production revision `28c30d1231549bed43a893aa71ee1f9fcb21e4ed`, `/resources` and its contact CTA worked. Both PDFs and the CSV returned HTTP 200 with expected MIME types and exact reviewed hashes. Local desktop/mobile and all four rendered PDF pages had already passed visual checks. |
| Comparable baseline and reporting utility | PR 188 merged after all CI checks passed. Five offline tests and 22 live read-only report requests passed. See [baseline](baseline-2026-09-06.md) and [reporting procedure](reporting-operations.md). |
| Sitemap submission and processing | Submitted at 09:18:19 UTC; API returned 204. Subsequent GSC read showed processing complete, 45 discovered sitemap URLs and zero errors/warnings for the version Google fetched. Later releases expand that sitemap. |

The backend's automatic deployment step failed despite a successful image build. Its check annotation records exit 22, consistent with one of the step's two `curl --fail` calls receiving an HTTP error; the available evidence does not identify which request or response status. GitHub's log endpoint returned `BlobNotFound`. The reviewed image was selected and deployed through the currently configured authenticated Coolify API. The old connector endpoint remains unusable; the current API works. The initial web deployment queue included redundant builds from these SEO merges; two superseded queued web jobs were cancelled after verifying their identity. Coolify returned HTTP 500 for cancellation, but follow-up reads confirmed `cancelled-by-user`. The latest reviewed web deployment was retained.

## Live enquiry and Analytics check

At **10:03:55 UTC**, one synthetic enquiry identified as `QV-SEO-20260906-1003` was submitted through the real resource-page CTA and contact form. At **10:03:59 UTC**, `/api/contact` returned HTTP 200 with `ok: true`, after the configured mail provider acknowledged delivery to `info@quickvoice.co`. The browser displayed its success message. No second enquiry was sent.

The browser emitted exactly one `generate_lead` with `method=contact_form`, `form_location=contact_page` and `page_path=/company/contact`. Submitted contact fields were absent from those parameters. Google collection returned HTTP 204 for that event to `G-SZFBG11VRP`. GA Realtime separately showed an active user and a `page_view` on stream `15188028920`; a later read returned no rows, and the lead has not yet been independently observed in a GA report. The browser collection response and the report observation are distinct evidence. These synthetic checks are release evidence, not customer leads or campaign results.

Provider acceptance does not establish inbox placement. A search of the connected mailbox found no matching test message; the configured recipient's mailbox is not independently accessible through that connection. Recipient confirmation of arrival and Reply-To is pending. Key-event registration remains pending Analytics edit access.

## Completed backlog review and final integration

The fixed 133-item review queue now has individual decisions: 78 blog entries, 33 illustrative scenarios and 22 marketing routes. The blog work comprises 77 substantive rewrites and one documented archive where the former Air AI comparison could not be supported by current product evidence. Across the complete 90-article source collection, 65 currently published articles have valid content-bound reviews. The 24 scheduled educational drafts retain their dates and require publication-time review before indexing; the one scheduled archive remains unavailable. All original article filenames, slugs and publication dates are preserved.

All 33 scenarios now use specific planning briefs without invented customers, quotations or results; their detail pages retain noindex and stay outside the sitemap. Twenty of the remaining marketing routes passed source review. The privacy and terms routes have completed review decisions with explicit owner-confirmation requirements, detailed in the [trust report](trust-review-2026-09-06.md); they are not marked factually verified.

The final combined source passed 39 root tests, 34 web tests, five reporting tests, web lint, type checks and a production build. The campaign claims check scanned 197 active files, and a separate scan covered all 90 blog sources, including future drafts. Independent review found and corrected Markdown-filtering edge cases; regression cases preserve visible claims in code, escaped links and incomplete links. Full live-route verification belongs to the deployed revision and is recorded separately when complete.

## External dependencies and scheduled work

- GA read access works. The current OAuth grant lacks `analytics.edit`; `generate_lead` is not registered as a key event. Keep manual page views off until `pageChangesEnabled` can be disabled and the live no-duplicate check completed. Code emission, GA collection, key-event registration and verified business enquiries are separate observations.
- SalesBlink requires reconnection before the selected opt-in list, consent records, sending identity, company footer and suppressions can be inspected. No sequence has been enrolled or sent. Use resource-request wording only for recipients with that recorded request; the drafts include an alternative opening for broader evaluation opt-ins.
- LinkedIn publication needs administrative access to [QuickVoice's actual page](https://www.linkedin.com/company/quickvoiceai). The similarly named `quickvoice` page represents another product. No owned post has been published by this work.
- Directory packages remain prepared. Verify account eligibility, actual submitter identity and the channel's requirements before submitting; no paid placement is selected. AlternativeTo's product-maturity requirement remains a separate eligibility question.
- Real customer stories require actual customer evidence and publication permission. Illustrative scenarios are not a substitute. The walkthrough script needs a verified synthetic-data test environment, an actual recorded interaction, captions and a transcript before publication. The directory package also needs a labeled screenshot from that environment; the existing dashboard image contains phone numbers and unlabeled metrics and is not approved for submission.
- The 90-day calendar remains a schedule. Day 1 has not been asserted merely because code, reviews and downloads are ready. Weekly observations, customer replies, directory acceptance and Day 30/60/90 outcomes must be logged when they occur.

Repository content decisions and final live checks are recorded at their actual batch/release boundaries. Local and CI checks establish the tested revision's behavior; Google indexing and commercial outcomes remain subsequent observations.
