# Knowledge document preview and download

The console previews PDF, TXT and CSV uploads inside the knowledge-source dialog. Other uploaded formats remain downloadable. Text is rendered as escaped text, with the first 200 KB displayed for large files; downloads contain the complete original file.

`GET /api/v1/kb/:kbId/file?disposition=inline|attachment` requires authentication and `knowledgeSource:read`. The organization comes from the authenticated session or API key. Both the database row and storage path must belong to that organization.

The server streams S3 bytes through the API with backpressure, a 30-second timeout, cancellation on disconnect, a 10 MB limit matching supported uploads, and `private, no-store` caching. The console uses local object URLs for PDF viewing and downloads, releases preview URLs on close, and cancels pending requests when the viewer is dismissed. No storage URL or signature is returned by this endpoint. The older `file-url` endpoint remains temporarily compatible with cached consoles during rolling deployment.

Deploy the API server before the console. Existing S3 configuration and `GetObject` access are sufficient; no environment changes or database migration are needed.

Checks:

```sh
pnpm --filter server exec tsx --test tests/kb/kb-file-access.service.test.ts tests/kb/kb-file-preview.test.ts
node --test apps/console/tests/kb-document-preview.test.mjs apps/console/tests/kb-entry-edit.test.mjs
```

For a deployment smoke test, preview a TXT containing Unicode, a CSV, and a PDF. Confirm that the console URL stays unchanged, no new tab opens, and downloads save with the original filename. Close a loading preview, retry a failed preview, and verify that a different organization cannot retrieve the file. PDF display depends on the browser's built-in PDF support; the download action remains available for PDF readers.
