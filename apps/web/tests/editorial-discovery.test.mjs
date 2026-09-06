import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import ReactMarkdown from "react-markdown";
import * as discovery from "../src/lib/blog-discovery.mjs";
import { applyEditorialHeadings, getEditorialHeadings, editorialHeadingsPlugin } from "../src/lib/editorial-headings.mjs";
import { computeContentHash, isValidEvidenceReview } from "../src/lib/blog-review.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const matter = require("gray-matter");
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
      const target = "src/" + name.slice(2);
      return name.endsWith(".mjs") ? require(new URL(target, root).pathname) : loadTs(target + ".tsx", overrides);
    }
    return fileRequire(name);
  };
  new Function("require", "module", "exports", output)(resolve, mod, mod.exports);
  return mod.exports;
}

const posts = Array.from({ length: 25 }, (_, i) => ({
  slug: "guide-" + String(i + 1).padStart(2, "0"),
  title: i % 2 ? "Appointment workflow" : "Support workflow",
  metaDescription: "Business evaluation", category: "Use Case Guides",
  date: "2026-08-" + String(i + 1).padStart(2, "0"),
  tags: ["pilot"], readTime: "5 min", author: "Editorial team",
}));

test("topics normalize existing labels without changing article metadata", () => {
  const original = { slug: "setup", category: "Implementation & How-To", tags: ["setup"] };
  const before = JSON.stringify(original);
  assert.equal(discovery.getBlogTopic(original).id, "implementation");
  assert.equal(discovery.getBlogTopic({ slug: "ai-vs-human-agents-cost-comparison", category: "Comparisons" }).id, "comparisons");
  assert.equal(discovery.getBlogTopic({ category: "Guides" }).id, "fundamentals");
  assert.equal(discovery.getBlogTopic({ category: "ROI & Business Case" }).label, "Costs and ROI");
  assert.equal(JSON.stringify(original), before);
});

test("server listing returns 12 distinct results per page and preserves source ordering", () => {
  const before = JSON.stringify(posts);
  const pages = [1, 2, 3].map((page) => discovery.getBlogListing(posts, { page: String(page) }));
  assert.deepEqual(pages.map((page) => page.posts.length), [12, 12, 1]);
  assert.equal(new Set(pages.flatMap((page) => page.posts.map((post) => post.slug))).size, 25);
  assert.equal(pages[0].posts[0].slug, "guide-25");
  assert.equal(pages[1].firstResult, 13);
  assert.equal(pages[1].lastResult, 24);
  assert.equal(JSON.stringify(posts), before);
});

test("search, topics and pagination compose and invalid ranges cannot repeat page one", () => {
  assert.equal(discovery.getBlogListing(posts, { q: "  appointment   workflow ", topic: "workflows" }).total, 12);
  assert.equal(discovery.getBlogListing(posts, { q: "missing" }).total, 0);
  assert.equal(discovery.getBlogListing(posts, { topic: "unknown" }).total, 0);
  for (const page of ["0", "-1", "1.5", "2junk", "999999999999999999999", "4"]) {
    assert.equal(discovery.getBlogListing(posts, { page }).outOfRange, true);
  }
  assert.equal(discovery.normalizeBlogFilters({ q: ["pilot", "ignored"], page: ["2", "3"] }).requestedPage, 2);
  assert.equal(discovery.normalizeBlogFilters({ q: "x".repeat(150) }).query.length, 120);
  assert.equal(discovery.blogListingHref({ query: "calls & costs", topic: "costs", page: 2 }), "/blog?q=calls+%26+costs&topic=costs&page=2");
});

test("plain pagination is self-canonical and crawlable; search/topic variants are noindex", () => {
  assert.deepEqual(discovery.blogListingMetadata({}), { canonical: "https://quickvoice.co/blog", index: true });
  assert.deepEqual(discovery.blogListingMetadata({ page: "2" }), { canonical: "https://quickvoice.co/blog?page=2", index: true });
  assert.deepEqual(discovery.blogListingMetadata({ page: "1", q: "", topic: "" }), { canonical: "https://quickvoice.co/blog", index: true });
  for (const params of [{ q: "support" }, { topic: "workflows", page: "2" }, { topic: "unknown" }, { page: "invalid" }]) {
    assert.deepEqual(discovery.blogListingMetadata(params), { canonical: "https://quickvoice.co/blog", index: false });
  }
});

test("heading outline and rendered IDs share one transform with collision handling", () => {
  const content = "# An **AI** guide\n\n## Costs & café\n\n### Costs & café\n\n## Costs cafe-2\n\n## [Actions](https://example.com) and " + String.fromCharCode(96) + "tools" + String.fromCharCode(96) + "\n\nSetext heading\n--------------\n\n~~~md\n## Not a section\n~~~\n\n\\# Escaped text\n";
  const options = { title: "An AI guide" };
  const headings = getEditorialHeadings(content, options);
  assert.deepEqual(headings.map((h) => h.id), ["article-costs-cafe", "article-costs-cafe-2", "article-costs-cafe-2-2", "article-actions-and-tools", "article-setext-heading"]);
  const html = renderToStaticMarkup(React.createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm, [editorialHeadingsPlugin, options]],
  }, content));
  for (const heading of headings) assert.ok(html.includes('id="' + heading.id + '"'));
  assert.doesNotMatch(html, /<h1/);
  assert.doesNotMatch(html, /<h2[^>]*>An /);
  assert.equal((html.match(/id="article-/g) ?? []).length, headings.length);
  assert.match(html, /Not a section/);
  assert.equal(headings.some((heading) => heading.text === "Not a section"), false);
});

test("only an exact leading title is removed; later and differing headings remain", () => {
  const content = "# Different title\n\nParagraph\n\n# Actual title\n\n## 日本語";
  const tree = unified().use(remarkParse).parse(content);
  const headings = applyEditorialHeadings(tree, { title: "Actual title", idPrefix: "checklist" });
  assert.deepEqual(headings.map((h) => h.text), ["Different title", "Actual title", "日本語"]);
  assert.ok(headings.every((heading) => heading.id.startsWith("checklist-")));
  assert.equal(tree.children[0].depth, 2);
});

test("fragment links and references resolve to the same prefixed IDs, including repeated headings", () => {
  const content = "# Guide\n\n[Top](#guide) [First](#costs--caf%C3%A9) [Again](#costs--caf%C3%A9-1) [Reference][cost]\n\n## Costs & café\n\n## Costs & café\n\n[Keep](#unknown) [Other page](/blog/other#costs) [Already mapped](#article-costs-cafe)\n\n[cost]: #costs--caf%C3%A9-1\n";
  const Renderer = loadTs("src/components/blog/MarkdownRenderer.tsx", {
    "@/lib/links": loadTs("src/lib/links.ts"),
  }).default;
  const html = renderToStaticMarkup(React.createElement(Renderer, { content, title: "Guide" }));
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
  const fragments = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(fragments, ["article-title", "article-costs-cafe", "article-costs-cafe-2", "article-costs-cafe-2", "unknown", "article-costs-cafe"]);
  for (const fragment of fragments.filter((value) => value !== "unknown")) assert.ok(ids.has(fragment));
  assert.match(html, /href="\/blog\/other#costs"/);
  assert.doesNotMatch(html, /<h1/);
});

test("every existing source keeps its fingerprint through presentation transforms", () => {
  const directory = new URL("content/blog/", root);
  let reviewed = 0;
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".md"))) {
    const raw = readFileSync(new URL(file, directory), "utf8");
    const { data, content } = matter(raw);
    const hash = computeContentHash(data, content);
    getEditorialHeadings(content, { title: data.title });
    discovery.getBlogTopic(data);
    assert.equal(computeContentHash(data, content), hash, file);
    if (data.evidenceReview) {
      assert.equal(isValidEvidenceReview(data.evidenceReview, hash, new Date()), true, file);
      reviewed++;
    }
    assert.equal(readFileSync(new URL(file, directory), "utf8"), raw, file);
  }
  assert.ok(reviewed > 0);
});

test("rendered SSR pagination provides real links, preserves filters and excludes unreviewed excerpts", async () => {
  const legacy = { ...posts[0], slug: "legacy", title: "Legacy reference", metaDescription: "UNVERIFIED EXCERPT" };
  const links = loadTs("src/lib/links.ts");
  const overrides = {
    "@/lib/blog": { getAllPosts: () => [...posts, legacy], isIndexablePost: (post) => post.slug !== "legacy" },
    "@/lib/blog-discovery.mjs": discovery,
    "@/lib/links": links,
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
  };
  const page = loadTs("src/app/blog/page.tsx", overrides);
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ page: "2" }) }));
  assert.equal((html.match(/<article/g) ?? []).length, 12);
  assert.match(html, /href="\/blog\?page=3"[^>]*rel="next"/);
  assert.doesNotMatch(html, /UNVERIFIED EXCERPT|<main/);
  const filtered = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ q: "workflow", topic: "workflows" }) }));
  assert.match(filtered, /href="\/blog\?q=workflow&amp;topic=workflows&amp;page=2"/);
  await assert.rejects(page.default({ searchParams: Promise.resolve({ page: "4" }) }), /NOT_FOUND/);
  const metadata = await page.generateMetadata({ searchParams: Promise.resolve({ page: "2" }) });
  assert.equal(metadata.robots.index, true);
  assert.equal(metadata.alternates.canonical, "https://quickvoice.co/blog?page=2");
});

test("resources offer downloads before readable details with distinct document anchors", () => {
  const resources = loadTs("src/app/resources/page.tsx", {
    "@/lib/links": loadTs("src/lib/links.ts"),
  });
  const html = renderToStaticMarkup(React.createElement(resources.default));
  for (const file of ["phone-agent-checklist.pdf", "cost-estimation.csv", "cost-estimation-guide.pdf"]) {
    const position = html.indexOf('href="/resources/' + file + '"');
    assert.ok(position > -1 && position < html.indexOf("<details"), file);
  }
  assert.equal((html.match(/<details/g) ?? []).length, 2);
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.doesNotMatch(html, /<main/);
  assert.doesNotMatch(html, /<h2[^>]*>AI phone-agent implementation checklist<\/h2>/);
  assert.match(html, /id="checklist-title"/);
  assert.match(html, /id="costs-title"/);
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
});
