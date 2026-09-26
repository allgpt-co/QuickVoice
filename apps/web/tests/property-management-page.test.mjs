import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = new URL("../", import.meta.url);

function loadTs(relative, overrides = {}) {
  const url = new URL(relative, root);
  const output = ts.transpileModule(readFileSync(url, "utf8"), {
    fileName: url.pathname,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const mod = { exports: {} };
  const fileRequire = createRequire(url);
  function resolve(name) {
    if (name in overrides) return overrides[name];
    if (name === "next/link")
      return function MockLink({ children, ...props }) {
        return React.createElement("a", props, children);
      };
    if (name.startsWith("@/")) {
      const target = name.startsWith("@/data/")
        ? name.slice(2)
        : "src/" + name.slice(2);
      if (name.endsWith(".mjs"))
        return fileRequire(new URL(target, root).pathname);
      return loadTs(
        target + (existsSync(new URL(target + ".ts", root)) ? ".ts" : ".tsx"),
        overrides,
      );
    }
    return fileRequire(name);
  }
  new Function("require", "module", "exports", output)(
    resolve,
    mod,
    mod.exports,
  );
  return mod.exports;
}

test("existing property URL owns the focused pilot, canonical, accessible content and truthful proof status", () => {
  const { default: Page, metadata } = loadTs(
    "src/app/industries/real-estate/page.tsx",
  );
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.equal(
    metadata.alternates.canonical,
    "https://quickvoice.co/industries/real-estate",
  );
  assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
  assert.match(metadata.title, /Property Management/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(
    html,
    /href="\/company\/contact#enquiry" data-analytics-location="property_management_hero"/,
  );
  assert.match(html, /Discuss a leasing-intake pilot/);
  assert.match(html, /href="\/resources\/property-management-call-intake"/);
  assert.match(html, /not a recorded call, executed test, or customer result/);
  assert.match(html, /30 unexecuted synthetic test cases/);
  assert.match(html, /does not include a verified native connector/);
  assert.match(html, /staff must confirm availability/);
  assert.doesNotMatch(
    html,
    /<audio|<video|<iframe|AggregateRating|Review"|VideoObject/,
  );
  assert.doesNotMatch(html, /href="\/industries\/property-management/);
  const schema = JSON.parse(
    html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1],
  );
  assert.equal(schema[0]["@type"], "BreadcrumbList");
  assert.equal(
    schema[0].itemListElement.at(-1).item,
    metadata.alternates.canonical,
  );
  for (const question of schema[1].mainEntity) {
    // JSON-LD and visible FAQ share the source rather than drifting into extra promises.
    assert.ok(html.includes(question.name.replaceAll("'", "&#x27;")));
    const visibleAnswer = renderToStaticMarkup(
      React.createElement("span", null, question.acceptedAnswer.text),
    ).replace(/^<span>|<\/span>$/g, "");
    assert.ok(html.includes(visibleAnswer), "FAQ answer matches its JSON-LD");
  }
});

test("property guides, hub and sitemap create one internally linked canonical cluster", () => {
  const { workflowPages } = loadTs("data/workflow-pages.ts");
  const expected = [
    "ai-voice-agents-property-management",
    "property-management-answering-services",
    "after-hours-leasing-call-handling",
    "property-management-answering-service-cost",
    "property-management-phone-agent-integration-checklist",
  ];
  assert.deepEqual(
    workflowPages.realEstate.guides.map((guide) => guide.slug),
    expected,
  );
  const { marketingInformation } = loadTs("data/marketing-information.ts");
  assert.ok(
    marketingInformation.industries.sections[0].links.some(
      (link) => link.href === "/industries/real-estate",
    ),
  );
  assert.ok(
    marketingInformation.industries.sections[0].links.some(
      (link) => link.href === "/resources/property-management-call-intake",
    ),
  );
  const { default: sitemap } = loadTs("src/app/sitemap.ts", {
    "@/lib/blog": {
      getIndexablePosts: () => expected.map((slug) => ({ slug })),
      getPostModifiedDate: () => "2026-09-26",
    },
  });
  const urls = sitemap().map((entry) => entry.url);
  for (const path of [
    "/industries/real-estate",
    "/resources/property-management-call-intake",
    ...expected.map((slug) => `/blog/${slug}`),
  ]) {
    assert.equal(
      urls.filter((url) => url === `https://quickvoice.co${path}`).length,
      1,
      path,
    );
  }
  assert.equal(
    urls.some(
      (url) =>
        url.includes("/industries/property-management") ||
        url.includes("/case-studies/"),
    ),
    false,
  );
});

test("pilot enquiry guidance stays optional without extending the public form contract", () => {
  const { ContactForm } = loadTs("src/components/contact-form.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ContactForm, { location: "contact_page" }),
  );
  assert.match(html, /portfolio size, call volume, current systems/);
  assert.match(html, /These details are optional/);
  assert.doesNotMatch(
    html,
    /name="(?:portfolio|units|industry|callVolume|pms)"/,
  );
  assert.match(html, /sensitive customer information/);
});
