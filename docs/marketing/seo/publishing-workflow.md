# Publishing and re-review workflow

Run commands from the repository root with the documented Node/pnpm dependencies installed. This procedure describes the implementation in [review-seo-article.mjs](../../../scripts/review-seo-article.mjs), [blog-review.mjs](../../../apps/web/src/lib/blog-review.mjs) and [blog.ts](../../../apps/web/src/lib/blog.ts). A review stamp records a completed factual review; the command cannot perform that review or verify that a source actually supports a claim.

## 1. Review the exact article before stamping

Read the whole Markdown body and every frontmatter field, including title, description, author biography, tags, image text and dates. Open each primary source and check the specific claim against its scope and current state. Check QuickVoice capability claims against the current implementation. Remove unsupported performance, customer, compliance, integration and competitor claims; do not use an audit exception to make an article pass.

Follow each commercial link and check the destination's claims. In particular, a booking tutorial must distinguish request intake from a confirmed calendar write: the default live MCP bridge restricts tools marked as writes or side effects. A booking action requires a separately implemented, permitted action path and a verified destination-system result.

Keep `slug` and the original quoted ISO `date` when revising an existing article. Add or change quoted `updatedAt` only for a substantive content revision, using its real date; do not refresh it for a new build, review stamp or cosmetic edit. It must be on/after publication, not in the future, and no later than the review timestamp. Future-dated, draft or unpublished articles remain unindexable even with a valid review. Fix an inaccurate historical date only with a documented source and reason.

## 2. Issue the review record

After reviewing this specific example article and the listed sources, use the real reviewer's name or truthful agent identity in place of the placeholder:

```sh
node scripts/review-seo-article.mjs \
  apps/web/content/blog/free-ai-appointment-scheduling-tools.md \
  --reviewer 'Actual reviewer identity' \
  --source https://calendly.com/pricing \
  --source https://cal.com/pricing \
  --source https://support.google.com/calendar/answer/11608416 \
  --source https://github.com/allgpt-co/QuickVoice \
  --source https://docs.vapi.ai/assistants/examples/appointment-scheduling
```

For another article, supply its actual file and repeat `--source` for its supporting sources. The CLI accepts only Markdown files inside the blog directory, requires a reviewer and HTTP(S) sources, rejects claim-audit exception markers, checks dates, runs the targeted public-claims audit and refuses to write if content changes during the check. It then writes `evidenceReview` with a current UTC `reviewedAt`, reviewer, deduplicated sources and content hash. Inspect the resulting diff; never bulk-stamp unreviewed articles.

The SHA-256 fingerprint covers parsed frontmatter and body, excluding only the review record. Editing content or metadata after stamping invalidates the review. Re-read the change and affected sources, then rerun the CLI after the final edit or formatting pass. Do not copy an old hash, hand-edit a new one, or reset publication dates to restore indexing. The current review record has no automatic time-to-live; source freshness remains an editorial responsibility.

## 3. Run the checks before release

```sh
pnpm --filter web test
pnpm claims:audit:seo
pnpm --filter web lint
pnpm --filter web check-types
pnpm --filter web build
```

The web tests cover review issuance, stale hashes, metadata/date handling, sitemap exclusions and marketing behavior. `claims:audit:seo` checks the selected 12 articles, every article carrying a review record, campaign routes and their local component dependencies. It is a campaign gate, not certification of the entire legacy site. Resolve failures and rerun affected checks after changes; record the actual checked revision and results.

## 4. Deploy and inspect the rendered result

After the checked revision is deployed through the normal release workflow, inspect the live article and sitemap rather than relying on a local frontmatter value:

```sh
curl -fsS https://quickvoice.co/blog/free-ai-appointment-scheduling-tools -o /tmp/quickvoice-seo-article.html
curl -fsS https://quickvoice.co/sitemap.xml -o /tmp/quickvoice-seo-sitemap.xml
curl -sS -D - -o /dev/null https://www.quickvoice.co/blog/free-ai-appointment-scheduling-tools
```

Confirm HTTP success, the apex canonical, expected robots directive, title/description and accurate article dates/structured data. A reviewed published article should be indexable and present in the sitemap. Check one unreviewed article still has `noindex` and is absent, and that illustrative case-study detail URLs are absent. Confirm sitemap dates reflect content dates rather than request/build time and the `www` redirect preserves the path. Record live URLs, actual deployment revision and observation time in the status/inventory tracker. Search-engine indexing itself is a later observation, not guaranteed by these checks.

Blog pages, the blog hub and sitemap currently declare `revalidate = 3600`. This allows hourly cache revalidation in the deployed app; it is not a cron job or a guarantee that every URL refreshes at the hour. Verify a fresh response after cache regeneration where necessary. Repository content changes still require deployment; a revalidation interval does not publish local edits. See [Next.js ISR behavior](https://nextjs.org/docs/app/guides/incremental-static-regeneration).

## 5. Verify enquiry measurement separately

The implemented success event is `generate_lead`. Both contact forms call it only after an HTTP-success response with `data.ok === true`; errors and a CTA click are not leads. Its properties are `method=contact_form`, `form_location` (`homepage` or `contact_page`) and `page_path`; submitted contact fields are not included. The web app now defaults to the verified `G-SZFBG11VRP` only on `quickvoice.co` and `www.quickvoice.co`. With a blank or absent setting, localhost, preview domains, and other self-hosted domains send no default Analytics traffic. Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to a valid `G-` ID to override it on any host, or `off` to disable it. These settings require a rebuild. Verify the actual deployed tag and that a consent-appropriate, authorized test appears in GA. Record failed/successful-path checks without creating unsolicited real enquiries.

**Pending external administration:** confirm and, if missing, mark `generate_lead` as a key event in GA4 property `543950329` through an appropriately authorized property administrator. The available OAuth token is read-only, so this setup has not been performed. Code emission and key-event registration are separate. Google's [event-marking instructions](https://support.google.com/analytics/answer/13128484?hl=en) explain the UI; the [Admin API creation method](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/properties.keyEvents/create) requires `analytics.edit`. Record the actual registration date and first observed key event; marking does not rewrite historical reports.

## 6. Regenerate buyer downloads after a source change

The public `/resources` page reads the generated Markdown copies and serves the checklist PDF, editable CSV, and instruction PDF. Their reviewed sources remain in this folder. After changing the checklist, worksheet, instructions, or generator:

```sh
python3 -m pip install reportlab
python3 scripts/build-seo-resources.py
pnpm --filter web test
```

The generator creates PDFs in `output/pdf/` and copies the public files to `apps/web/public/resources/`. Commit the generated public files and manifest with the source change. The web test compares source, generator, and download hashes so a later source edit cannot silently leave an old download. Render and visually review both PDFs before release; check all download links on the live resource page afterward. The CSV intentionally contains formulas; retain their original rows and import it with formula interpretation.
