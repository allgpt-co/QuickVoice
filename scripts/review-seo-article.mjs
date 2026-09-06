#!/usr/bin/env node
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeContentHash, isEvidenceSource, parseContentDate } from "../apps/web/src/lib/blog-review.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const matter = require("gray-matter");

try {
  const args = process.argv.slice(2);
  const article = args.shift();
  let reviewer;
  const sources = [];
  while (args.length) {
    const option = args.shift();
    const value = args.shift();
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${option}`);
    if (option === "--reviewer") reviewer = value.trim();
    else if (option === "--source") sources.push(value);
    else throw new Error(`Unknown argument: ${option}`);
  }
  if (!article || !reviewer || sources.length === 0 || !sources.every(isEvidenceSource)) {
    throw new Error("Usage: node scripts/review-seo-article.mjs apps/web/content/blog/article.md --reviewer 'Actual reviewer' --source https://primary-source.example/page (repeat --source as needed). Complete the factual review before running this command.");
  }
  const file = realpathSync(resolve(root, article));
  const blogRoot = realpathSync(resolve(root, "apps/web/content/blog"));
  if (!file.startsWith(`${blogRoot}${sep}`) || !file.endsWith(".md")) throw new Error("Review target must be a Markdown article inside apps/web/content/blog.");
  const raw = readFileSync(file, "utf8");
  if (/claims-audit:\s*allow/i.test(raw)) throw new Error("Article reviews do not accept claims-audit exception markers.");
  const { data, content } = matter(raw);
  const now = new Date();
  const publishedAt = parseContentDate(data.date);
  const updatedAt = data.updatedAt === undefined ? null : parseContentDate(data.updatedAt);
  if (!data.slug || !publishedAt || (data.updatedAt !== undefined && (!updatedAt || updatedAt > now || updatedAt < publishedAt))) {
    throw new Error("Article requires a slug, valid publication date, and a valid substantive updatedAt date if supplied.");
  }
  const audit = spawnSync(process.execPath, ["scripts/audit-public-claims.mjs", "--target", relative(root, file)], { cwd: root, encoding: "utf8" });
  if (audit.status !== 0) throw new Error(audit.stdout || audit.stderr || "Public claims audit did not complete.");
  if (readFileSync(file, "utf8") !== raw) throw new Error("Article changed during its audit; review the latest version and run again.");
  const review = { status: "reviewed", reviewedAt: now.toISOString(), reviewer, sources: [...new Set(sources)], contentHash: computeContentHash(data, content) };
  data.evidenceReview = review;
  const output = matter.stringify(content, data);
  const roundtrip = matter(output);
  if (computeContentHash(roundtrip.data, roundtrip.content) !== review.contentHash) throw new Error("Review serialization changed article content; no changes written.");
  writeFileSync(file, output);
  process.stdout.write(`Reviewed ${relative(root, file)} as ${reviewer}; content fingerprint ${review.contentHash}.\n`);
} catch (error) {
  process.stderr.write(`[seo-review] ${error.message}\n`);
  process.exitCode = 1;
}
