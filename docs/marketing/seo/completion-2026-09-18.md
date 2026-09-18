# SEO completion release — September 18, 2026

This release continues the September 16 growth worktree. The September 6 content
review and initial deployment are already complete; the older checkout's
preparation tracker is not the current execution state.

## Release candidate

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
- Automatic weekly reporting is prepared in the private QuickVoiceMarketing
  repository, using a pinned public source revision, private artifacts and
  durable private aggregate summaries. No report or lead data belongs in this
  public repository.

The September 18 candidate should contain 101 sitemap entries: 34 static pages
and 67 reviewed articles. Eligibility still depends on publication dates and
valid content fingerprints. Future drafts, the archived comparison, and
illustrative scenario details remain excluded.

## Verification and activation record

Local verification passed: 79 root tests, 64 web tests, 14 contact/mailer tests,
and 48 SEO operations tests; web lint, web/server type checks and both builds.
The claims audit passed 191 files. A crawl of the local production build checked
all 101 sitemap URLs: HTTP 200, indexable, self-canonical, one H1 and a nonempty
description. Evidence is in ignored `output/seo/2026-09-18/`.

Released revisions, hosting receipts and live verification will be recorded
after they finish. These local checks do not establish production deployment.

The initial September 18 read-only GA preflight confirmed missing `generate_lead`
and all three event-scoped dimensions. The current grant still lacks
`analytics.edit`, and the stream's browser-history pageviews remain enabled.
The user has been asked to enable access through secure settings; no token was
requested in chat. Manual pageviews must stay disabled until GA preparation is
verified. Working automatic collection remains active in the meantime.

## Remaining operating boundaries

The campaign's activation date is the verified release/measurement date, not the
date this document was created. Record reporting automation separately from a
completed human weekly review. Customer proof, recorded demonstrations, policy
owner confirmations, real sales qualification, outreach and future campaign
outcomes remain evidence-dependent or scheduled.
