import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BLOG_JOURNEYS, getBlogJourney } from "../data/blog-journeys.mjs";
import { rankRelatedPosts } from "../src/lib/blog-discovery.mjs";
import { computeContentHash, isValidEvidenceReview } from "../src/lib/blog-review.mjs";

const require = createRequire(import.meta.url);
const matter = require("gray-matter");
const ts = require("typescript");
const root = new URL("../", import.meta.url);

function loadTs(relative, overrides = {}) {
  const url = new URL(relative, root);
  const output = ts.transpileModule(readFileSync(url, "utf8"), {
    fileName: url.pathname,
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  const fileRequire = createRequire(url);
  const resolve = (name) => {
    if (name in overrides) return overrides[name];
    if (name === "next/link") return function MockLink({ children, ...props }) { return React.createElement("a", props, children); };
    if (name.startsWith("@/")) {
      const target = name.startsWith("@/data/") ? name.slice(2) : "src/" + name.slice(2);
      if (name.endsWith(".mjs")) return fileRequire(new URL(target, root).pathname);
      return loadTs(target + (existsSync(new URL(target + ".ts", root)) ? ".ts" : ".tsx"), overrides);
    }
    return fileRequire(name);
  };
  new Function("require", "module", "exports", output)(resolve, mod, mod.exports);
  return mod.exports;
}

const directory = new URL("content/blog/", root);
const articles = readdirSync(directory).filter((name) => name.endsWith(".md")).map((file) => {
  const { data, content } = matter(readFileSync(new URL(file, directory), "utf8"));
  return { ...data, content, contentHash: computeContentHash(data, content), draft: data.draft === true, published: data.published !== false };
});

test("curated journeys use existing internal destinations and distinct real article slugs", () => {
  const slugs = new Set(articles.map((post) => post.slug));
  for (const [slug, journey] of Object.entries(BLOG_JOURNEYS)) {
    assert.ok(slugs.has(slug), slug);
    assert.match(journey.href, /^\/(?:use-cases|solutions|industries)\/[a-z-]+$|^\/open-source$/);
    assert.ok(existsSync(new URL("src/app" + journey.href + "/page.tsx", root)), journey.href);
    assert.ok(journey.title && journey.description && journey.label && journey.contactLabel);
    assert.equal(journey.relatedSlugs.length, 3);
    assert.equal(new Set(journey.relatedSlugs).size, 3);
    for (const related of journey.relatedSlugs) {
      assert.ok(slugs.has(related), related);
      assert.notEqual(related, slug);
    }
  }
  for (const slug of ["not-configured", "toString", "constructor", "__proto__"]) assert.equal(getBlogJourney(slug), null);
});

test("task curation outranks generic category recency without modifying candidates", () => {
  const current = { slug: "current", category: "Guides", tags: [] };
  const candidates = [
    { slug: "new-unrelated", category: "Guides", tags: [], date: "2026-09-15" },
    { slug: "specific", category: "Use Case Guides", tags: [], date: "2026-03-01" },
    { slug: "next-specific", category: "Use Case Guides", tags: [], date: "2026-03-02" },
    current,
  ];
  const before = JSON.stringify(candidates);
  assert.deepEqual(rankRelatedPosts(current, candidates, 3, ["specific", "specific", "missing", "current", "next-specific"]).map((post) => post.slug), ["specific", "next-specific", "new-unrelated"]);
  assert.deepEqual(rankRelatedPosts(current, candidates, 1).map((post) => post.slug), ["new-unrelated"]);
  assert.equal(rankRelatedPosts(current, [...candidates, candidates[0]], 10).length, 3);
  for (const limit of [0, -1, 1.5, NaN]) assert.deepEqual(rankRelatedPosts(current, candidates, limit), []);
  assert.equal(JSON.stringify(candidates), before);
});

test("related-post integration cannot promote pending, future, or stale-review content", () => {
  const makeArticle = (slug, { future = false, pending = false, stale = false } = {}) => {
    const data = { slug, title: slug, date: future ? "2099-01-01" : "2026-03-01", category: "Comparisons", tags: [] };
    const content = "\nA synthetic test article.\n";
    if (!pending) data.evidenceReview = { status: "reviewed", reviewedAt: "2026-09-06T00:00:00.000Z", reviewer: "Test only", sources: ["https://example.com/source"], contentHash: stale ? "0".repeat(64) : computeContentHash(data, content) };
    return matter.stringify(content, data);
  };
  const files = {
    "current.md": makeArticle("vapi-alternatives"),
    "pending.md": makeArticle("quickvoice-vs-vapi", { pending: true }),
    "future.md": makeArticle("retell-ai-alternatives", { future: true }),
    "stale.md": makeArticle("best-ai-voice-agent-platforms-2026", { stale: true }),
    "eligible.md": makeArticle("eligible-fallback"),
  };
  const blog = loadTs("src/lib/blog.ts", { fs: {
    existsSync: () => true,
    readdirSync: () => Object.keys(files),
    readFileSync: (path) => files[String(path).split("/").at(-1)],
  } });
  assert.deepEqual(blog.getRelatedPosts("vapi-alternatives", 3).map((post) => post.slug), ["eligible-fallback"]);
});

test("priority article edits keep exact reviews and contextual workflow/pricing links", () => {
  for (const [slug, journey] of Object.entries(BLOG_JOURNEYS)) {
    const post = articles.find((candidate) => candidate.slug === slug);
    assert.ok(isValidEvidenceReview(post.evidenceReview, post.contentHash), slug);
    assert.ok(post.content.includes("](" + journey.href + ")"), slug + " workflow link");
    assert.ok(post.content.includes("](/pricing)"), slug + " pricing link");
    assert.ok(post.content.includes("](/company/contact)"), slug + " enquiry link");
    if (slug !== "quickvoice-vs-vapi") assert.equal(post.updatedAt, "2026-09-06", "link-only edits do not manufacture freshness");
  }
});

test("reviewed article SSR has a task-specific journey, resources, contextual recommendations and one H1", async () => {
  const slug = "free-ai-appointment-scheduling-tools";
  const post = articles.find((candidate) => candidate.slug === slug);
  const related = BLOG_JOURNEYS[slug].relatedSlugs.map((relatedSlug) => articles.find((candidate) => candidate.slug === relatedSlug));
  const makePage = (indexable) => loadTs("src/app/blog/[slug]/page.tsx", {
    "@/lib/blog": {
      getPostBySlug: () => post, getRelatedPosts: () => related,
      isIndexablePost: () => indexable, getPostModifiedDate: () => post.updatedAt,
    },
  });
  const html = renderToStaticMarkup(await makePage(true).default({ params: Promise.resolve({ slug }) }));
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /aria-labelledby="article-next-step"/);
  assert.match(html, /href="\/use-cases\/appointment-scheduling" data-analytics-location="article_journey"/);
  assert.match(html, /href="\/company\/contact" data-analytics-location="article_journey"/);
  assert.match(html, /href="\/resources"/);
  assert.match(html, /BlogPosting/);
  assert.doesNotMatch(html, /Editorial content under evidence review/);
  const pending = renderToStaticMarkup(await makePage(false).default({ params: Promise.resolve({ slug }) }));
  assert.doesNotMatch(pending, /article_journey|BlogPosting/);
  assert.match(pending, /Editorial content under evidence review/);
});
