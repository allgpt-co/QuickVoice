# Buyer resource release verification

Prepared 2026-09-06. The new `/resources` route presents the reviewed implementation checklist and cost instructions as HTML, with open PDF/CSV downloads. It links from the footer and sitemap and gives the three-email nurture sequence usable resource destinations. The worksheet retains its reviewed formulas and illustrative-input labels.

The Markdown/CSV sources remain in this directory. `scripts/build-seo-resources.py` generates the two PDFs and public source copies. A manifest records source, generator and download hashes; a web test detects stale or independently modified exports. The PDFs are reviewable exports; the HTML page provides the equivalent readable content without a PDF requirement.

## Local verification

- 28 web tests, web lint and type checks passed.
- The campaign claims audit passed across 70 files on this branch.
- The production build passed with 139 generated pages; build ID `EkiXr0BH4nfhxEOQsUhaC`.
- The resource page returned HTTP 200 with a self canonical and one H1. At 1440px and 390px viewports, document width equaled viewport width.
- The three download URLs returned HTTP 200 with PDF/CSV MIME types. Checklist PDF: 6,376 bytes; instruction PDF: 5,742 bytes; worksheet CSV: 5,471 bytes.
- Both PDFs were rendered and visually checked across all four pages. The instruction guide uses a deliberate page break before interpreting results. The CSV matched the reviewed source byte for byte.
- [Mobile page screenshot](verification-assets/buyer-resources-mobile.png): local browser evidence only, captured at 390 × 844. No enquiry or Analytics event was sent by this check.

These observations precede integration and production deployment. PR checks verify the integrated revision. Verify the deployed page and each download before activating the nurture sequence; this document does not record an email send or campaign start.

## Review queue

`review-queue.csv` records the original 133 outstanding assets: 78 blogs in 13 batches of six, 33 scenarios in seven batches of up to five, and 22 marketing routes in eight batches of up to three. The six priority blogs and three priority industry pages are first. Future blog publication dates remain in the queue and must not be moved forward to make an article appear published. A queued row is not a completed review.
