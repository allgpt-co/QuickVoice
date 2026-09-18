# SEO completion release — September 18, 2026

This release continues the September 16 growth worktree. The September 6 content
review and initial deployment are already complete; the older checkout's
preparation tracker is not the current execution state.

## Reviewed and merged release

- Nine contextual article journeys, the Vapi comparison, commercial clarity,
  optional contact receipts/attribution, measurement utilities and outcome
  reporting from September 16.
- Publication-time review of the September 14 Synthflow comparison, including
  current documented versioning and export limits. Original slug and publication
  date retained; substantive update September 18. Exact content review issued.
- Explicit deployment controls for contact attribution and manual pageviews.
  Default behavior preserves both settings; enabling requires recorded external
  prerequisites. Environment changes are read back before deployment.
- A separate GA history-setting mode in the measurement utility. It checks the
  actual QuickVoice stream, patches only `page_changes_enabled`, requires edit
  scope, and verifies the saved setting. An uncertain write is never repeated.
- Automatic weekly reporting is active in the private QuickVoiceMarketing
  repository, using a pinned public source revision, private artifacts and
  durable private aggregate summaries. No report or lead data belongs in this
  public repository.

The live September 18 sitemap contains 101 entries: 34 static pages
and 67 reviewed articles. Eligibility still depends on publication dates and
valid content fingerprints. Future drafts, the archived comparison, and
illustrative scenario details remain excluded.

## Verification and activation record

Local verification passed: 79 root tests, 64 web tests, 14 contact/mailer tests,
and 48 SEO operations tests; web lint, web/server type checks and both builds.
The claims audit passed 191 files. A crawl of the local production build checked
all 101 sitemap URLs: HTTP 200, indexable, self-canonical, one H1 and a nonempty
description. Evidence is in ignored `output/seo/2026-09-18/`.

[PR 208](https://github.com/allgpt-co/QuickVoice/pull/208) merged as
`1414cde5ee3c337e06b4dda544f2482f582f0e27`; [PR 209](https://github.com/allgpt-co/QuickVoice/pull/209)
adds the live receiver preflight and [PR 210](https://github.com/allgpt-co/QuickVoice/pull/210)
uses the established deployment runners and bounded access diagnostics. All
required PR and corresponding main checks passed. The final deployment-helper
suite passes 41 tests.

The [live public verification](verification-assets/production-2026-09-18.json)
at 13:24 UTC passed all 101 URLs: HTTP 200, indexable metadata, expected apex
canonical, one H1 and a description. All nine article journeys have their expected
commercial/contact destinations with no overflow at 375 px. The Synthflow page
was visually checked at mobile and desktop widths. All three resource downloads
return 200 with the expected PDF/CSV types. The www redirect preserves path and
query with HTTP 308. A future article remains 404/noindex and a sampled
illustrative scenario remains noindex and outside the sitemap. The production
console link still points to `app.quickvoice.co/login`.

Public observations confirm the content release. **The exact hosting revision,
receiver health and attribution activation are not yet verified.** The existing
automatic website deployment published the content independently of the blocked
manual workflow.

The [backend release workflow](https://github.com/allgpt-co/QuickVoice/actions/runs/35347478744)
completed successfully and returned server deployment receipt
`dzdh8pvsdfxblt2l24pbkyr9` and AI receipt `kbpbqi52qpotrbqgonhrpgkm`.
Its deploy step acknowledges queued deployments; it does not verify final live
health. The website helper performs that receiver check before flag activation.

Both manual website attempts stopped at their first read, before any mutation:
[hosted runner](https://github.com/allgpt-co/QuickVoice/actions/runs/35348922175)
returned HTTP 403, and the [established deployment runner](https://github.com/allgpt-co/QuickVoice/actions/runs/35349839956)
confirmed **API permission restriction**. Update the configured GitHub secret
securely with a team-scoped credential that can inspect both established apps,
read the required environment values, update the two flags, and deploy the web
app while preserving backend access. No credential value belongs in chat or Git.
No production QA enquiry was sent because attribution activation is still pending.

Six read-only GSC inspections after release still describe old crawls: automotive
and best-platforms are crawled-not-indexed; Retell alternatives retains an August
noindex observation; ElevenLabs/Deepgram retains a July 404 observation; Vapi and
Synthflow comparisons are not yet known to Google. All six currently return 200
with indexable metadata in the live crawl. Recrawl/indexing recovery remains a
monitoring task, not an unresolved live robots fix or a guaranteed outcome.

The initial September 18 read-only GA preflight confirmed missing `generate_lead`
and all three event-scoped dimensions. The current grant still lacks
`analytics.edit`, and the stream's browser-history pageviews remain enabled.
The user has been asked to enable access through secure settings; no token was
requested in chat. Manual pageviews must stay disabled until GA preparation is
verified. The live browser confirms one `G-SZFBG11VRP` tag configured for automatic initial
pageviews. Automatic collection remains configured in the meantime; this is not
a claim that every visit was received or that conversion administration is done.

## Private reporting activation

The [private reporting change](https://github.com/allgpt-co/QuickVoiceMarketing/pull/2)
is merged. The schedule is Mondays at 14:17 UTC, with manual dispatch available.
The [first hosted run](https://github.com/allgpt-co/QuickVoiceMarketing/actions/runs/35347815194)
passed on September 18: 141 reports, zero API errors, a durable private aggregate
summary and a private raw-evidence artifact retained for 90 days. Source scripts
are pinned to reviewed commit `1414cde5ee3c337e06b4dda544f2482f582f0e27`.
Only the reporting grant is stored in this private workflow; no Analytics edit
credential or lead records are required. This establishes automation, not a
completed human review, booking reconciliation, or sales qualification.

## Resume the remaining activation

1. Supply the hosting read/sensitive-read/write/deploy access through secure GitHub
   settings and an Analytics edit grant with property Editor/Admin access through
   secure credential settings. The existing reporting grant remains read-only.
2. Run `python3 scripts/seo-measurement-setup.py --check`, then `--apply` and verify
   `generate_lead` plus `cta_type`, `link_location`, and `form_location` exist.
   Inspect manual-pageview preparation with `--pageviews manual --check`; apply
   it only when ready to rebuild the web app immediately. Verify the saved setting.
3. After exact-current-main quality/security checks pass, dispatch:

   ```sh
   gh workflow run deploy-web.yml --repo allgpt-co/QuickVoice --ref main \
     -f contact_attribution=enable -f manual_pageviews=enable \
     -f prerequisites_verified=true \
     -f compatible_api_commit=1414cde5ee3c337e06b4dda544f2482f582f0e27
   ```

   If GA preparation is unavailable, use `manual_pageviews=preserve`; do not enable
   it against active GA browser-history pageviews. Update the API revision only
   when another compatible receiver release has actually been verified. An active
   automatic web deployment must finish before changing flags.
4. Verify the hosting revision/health and live initial/SPA/back-forward pageview
   counts. Submit one marked synthetic enquiry; verify the matching receipt,
   provider acknowledgement, destination inbox, and one received `generate_lead`
   event independently. Exclude QA from business outcomes. The connected mailbox
   is not the configured `info@quickvoice.co` destination, so inbox confirmation
   needs destination access or the recipient's confirmation.
5. Record the actual measurement activation date before starting the clean
   qualified-enquiry baseline. If a mutation times out, inspect state before retrying.

## Remaining operating boundaries

The campaign's activation date is the verified release/measurement date, not the
date this document was created. Record reporting automation separately from a
completed human weekly review. Customer proof, recorded demonstrations, policy
owner confirmations, real sales qualification, outreach and future campaign
outcomes remain evidence-dependent or scheduled.
