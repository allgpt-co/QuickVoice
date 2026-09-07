import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { computeContentHash, isValidEvidenceReview, parseContentDate } from "../src/lib/blog-review.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function loadTypeScript(url, overrides = {}) {
  const source = readFileSync(url, "utf8");
  const output = ts.transpileModule(source, { fileName: url.pathname, compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const compiledModule = { exports: {} };
  const fileRequire = createRequire(url);
  const resolveModule = (name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith("@/")) {
      const target = new URL("../src/" + name.slice(2), import.meta.url);
      if (name.endsWith(".mjs")) return fileRequire(target.pathname);
      const extension = existsSync(new URL(target.href + ".ts")) ? ".ts" : ".tsx";
      return loadTypeScript(new URL(target.href + extension), overrides);
    }
    return fileRequire(name);
  };
  new Function("require", "module", "exports", output)(resolveModule, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { isPublishedPost, isIndexablePost, getPostModifiedDate } = loadTypeScript(new URL("../src/lib/blog.ts", import.meta.url));
const now = new Date("2026-09-06T18:00:00.000Z");
const metadata = { slug: "test-article", title: "An evidence-backed article", date: "2026-03-19", updatedAt: "2026-09-05" };
const content = "A factual guide with source references.\n";
const contentHash = computeContentHash(metadata, content);
const review = {
  status: "reviewed", reviewedAt: "2026-09-06T17:00:00.000Z", reviewer: "Test reviewer",
  sources: ["https://github.com/allgpt-co/QuickVoice/blob/main/README.md"], contentHash,
};
const post = { ...metadata, contentHash, evidenceReview: review, published: true, draft: false };

test("legacy content remains readable but only reviewed, published content is indexable", () => {
  assert.equal(isPublishedPost({ ...post, evidenceReview: undefined }, { now }), true);
  assert.equal(isIndexablePost({ ...post, evidenceReview: undefined }, { now }), false);
  assert.equal(isIndexablePost(post, { now }), true);
  for (const overrides of [{ draft: true }, { published: false }, { status: "draft" }, { date: "2026-09-07" }, { date: "invalid" }]) {
    assert.equal(isIndexablePost({ ...post, ...overrides }, { now }), false);
  }
  assert.equal(isPublishedPost({ ...post, date: "invalid" }, { includeFuture: true, now }), false);
});

test("future, malformed, incomplete, and stale evidence reviews fail closed", () => {
  for (const overrides of [
    { status: "pending" }, { reviewedAt: "2026-09-07T00:00:00.000Z" }, { reviewedAt: "2026-02-30T00:00:00Z" },
    { reviewedAt: "2026-09-06" }, { reviewer: " " }, { sources: [] }, { sources: ["not-a-source"] },
    { sources: ["javascript:alert(1)"] }, { contentHash: "0".repeat(64) },
  ]) {
    assert.equal(isValidEvidenceReview({ ...review, ...overrides }, contentHash, now), false);
  }
  assert.equal(isIndexablePost({ ...post, contentHash: computeContentHash(metadata, `${content}Changed.`) }, { now }), false);
  assert.equal(isIndexablePost({ ...post, updatedAt: "2026-09-06T17:30:00.000Z" }, { now }), false);
});

test("review fingerprint covers metadata and body but is stable across metadata ordering and review issuance", () => {
  assert.equal(computeContentHash({ ...metadata, evidenceReview: review }, content), contentHash);
  assert.equal(computeContentHash({ updatedAt: metadata.updatedAt, date: metadata.date, title: metadata.title, slug: metadata.slug }, content), contentHash);
  assert.notEqual(computeContentHash({ ...metadata, title: "A changed claim" }, content), contentHash);
  assert.notEqual(computeContentHash(metadata, `${content}Another claim.`), contentHash);
});

test("publication and modification dates remain factual at UTC boundaries", () => {
  assert.equal(parseContentDate("2026-02-30"), null);
  assert.equal(isPublishedPost({ ...post, date: "2026-09-07" }, { now: new Date("2026-09-07T00:00:00Z") }), true);
  assert.equal(getPostModifiedDate(post, now), "2026-09-05");
  for (const updatedAt of [undefined, "invalid", "2026-02-01", "2026-09-07"]) {
    assert.equal(getPostModifiedDate({ ...post, updatedAt }, now), post.date);
  }
});

test("sitemap excludes unreviewed content and illustrative details and uses source modification dates", () => {
  const source = readFileSync(new URL("../src/app/sitemap.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const compiledModule = { exports: {} };
  const requireForSitemap = (name) => name === "@/lib/blog" ? {
    getIndexablePosts: () => [post, { ...post, slug: "pending", evidenceReview: undefined }].filter((candidate) => isIndexablePost(candidate, { now })),
    getPostModifiedDate: (candidate) => getPostModifiedDate(candidate, now),
  } : require(name);
  new Function("require", "module", "exports", output)(requireForSitemap, compiledModule, compiledModule.exports);
  const urls = compiledModule.exports.default();
  assert.equal(compiledModule.exports.revalidate, 3600);
  assert.equal(urls.find((entry) => entry.url.endsWith("/test-article")).lastModified.toISOString(), "2026-09-05T00:00:00.000Z");
  assert.equal(urls.some((entry) => entry.url.endsWith("/pending") || /\/case-studies\//.test(entry.url)), false);
  assert.ok(urls.filter((entry) => !entry.url.includes("/blog/")).every((entry) => !Object.hasOwn(entry, "lastModified")));
});

test("www host permanently redirects to the apex with paths preserved", async () => {
  // Next config uses import.meta.url; strip only that build-root expression for CommonJS evaluation.
  const configUrl = new URL("../next.config.ts", import.meta.url);
  const source = readFileSync(configUrl, "utf8").replace('fileURLToPath(new URL("../..", import.meta.url))', JSON.stringify(new URL("../../..", import.meta.url).pathname));
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", output)(require, compiledModule, compiledModule.exports);
  const config = compiledModule.exports.default;
  const redirects = await config.redirects();
  const hostRedirect = redirects.find((entry) => entry.has?.some((condition) => condition.type === "host" && condition.value === "www.quickvoice.co"));
  assert.equal(hostRedirect.source, "/:path*");
  assert.equal(hostRedirect.destination, "https://quickvoice.co/:path*");
  assert.equal(hostRedirect.permanent, true);
});

test("blog hub features reviewed guides and keeps legacy titles in a collapsed searchable archive", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const reviewed = { ...post, category: "Guides", tags: [], readTime: "5 min", metaDescription: "Reviewed description" };
  const legacy = { ...reviewed, slug: "legacy", title: "Legacy archive title", evidenceReview: undefined, metaDescription: "UNREVIEWED EXCERPT MUST NOT APPEAR" };
  const page = loadTypeScript(new URL("../src/app/blog/page.tsx", import.meta.url), {
    "@/lib/blog": { getAllPosts: () => [reviewed, legacy], isIndexablePost: (candidate) => isIndexablePost(candidate, { now }) },
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
  });
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  assert.match(html, /Reviewed description/);
  assert.doesNotMatch(html, /UNREVIEWED EXCERPT MUST NOT APPEAR/);
  assert.match(html, /<details[^>]*><summary/);
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
  assert.match(html, /href="\/blog\/legacy"/);
  const searched = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ q: "Legacy archive" }) }));
  assert.match(searched, /No reviewed guides found/);
  assert.match(searched, /href="\/blog\/legacy"/);
  assert.doesNotMatch(searched, /Reviewed description/);
});
