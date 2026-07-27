import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const WEB_ROOT = new URL("..", import.meta.url).pathname;
const SRC_ROOT = join(WEB_ROOT, "src");
const PUBLIC_ROOT = join(WEB_ROOT, "public");
const BLOG_ROOT = join(WEB_ROOT, "content/blog");
const TODAY = Date.UTC(2026, 5, 19, 23, 59, 59, 999);

function read(path) {
  return readFileSync(join(WEB_ROOT, path), "utf8");
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : fullPath;
  });
}

function publicAssetExists(assetPath) {
  try {
    return statSync(join(PUBLIC_ROOT, assetPath.replace(/^\/+/, ""))).isFile();
  } catch {
    return false;
  }
}

function markdownFrontmatterDate(markdown) {
  const match = markdown.match(/^date:\s*"?([^"\n]+)"?/m);
  return match?.[1] ?? null;
}

test("contact form has a working app route submit target", () => {
  const route = read("src/app/api/contact/route.ts");
  assert.match(route, /export\s+async\s+function\s+POST/);
  assert.match(route, /NextResponse\.json/);
  assert.doesNotMatch(route, /throw\s+new\s+Error\(["']not implemented/i);
});

test("public use-case CTAs point at valid contact and demo destinations", () => {
  const appointmentCta = read(
    "src/components/landing/appointment-scheduling/appointment-scheduling-cta-section.tsx",
  );
  const supportCta = read(
    "src/components/landing/customer-support/customer-support-cta-section.tsx",
  );

  for (const source of [appointmentCta, supportCta]) {
    assert.doesNotMatch(source, /href=["']\/contact["']/);
    assert.doesNotMatch(source, /href=["']\/demo["']/);
    assert.match(source, /CONTACT_URL/);
    assert.match(source, /DEMO_BOOKING_URL/);
  }
});

test("blog publishing excludes scheduled posts from public lists and slugs", () => {
  const futurePosts = readdirSync(BLOG_ROOT)
    .filter((filename) => filename.endsWith(".md"))
    .filter((filename) => {
      const date = markdownFrontmatterDate(readFileSync(join(BLOG_ROOT, filename), "utf8"));
      return date ? Date.parse(date) > TODAY : false;
    });

  assert.ok(futurePosts.length > 0, "fixture should include scheduled posts");

  const blogLib = read("src/lib/blog.ts");
  assert.match(blogLib, /includeFuture/);
  assert.match(blogLib, /isPublishedPost/);
  assert.match(blogLib, /resolveOgImage/);
  assert.match(blogLib, /getAllSlugs\(\)[\s\S]+getAllPosts\(\)/);
  assert.match(blogLib, /getPostBySlug[\s\S]+includeFuture/);
});

test("referenced local image and manifest assets exist", () => {
  const files = walk(SRC_ROOT).filter((file) => /\.(tsx?|jsx?)$/.test(file));
  const imageRefs = new Set(["/og-image.png"]);

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/["'](\/(?:images|blog\/images)\/[^"']+)["']/g)) {
      imageRefs.add(match[1]);
    }
    for (const match of source.matchAll(/["'](\/(?:og-image\.png|icon\.png|apple-icon\.png))["']/g)) {
      imageRefs.add(match[1]);
    }
  }

  const missing = [...imageRefs].filter((asset) => !publicAssetExists(asset));
  assert.deepEqual(missing, [], `missing public assets: ${missing.join(", ")}`);

  const manifest = read("src/app/manifest.ts");
  assert.match(manifest, /\/icon\.png/);
  assert.match(manifest, /\/apple-icon\.png/);
});

test("pricing, FAQ, and HIPAA copy use aligned public claims", () => {
  const pricing = read("src/app/pricing/page.tsx");
  const homepage = read("src/app/page.tsx");
  const faq = read("src/components/mvpblocks/faq-2.tsx");
  const hipaa = read("src/app/compliance/hipaa/page.tsx");

  assert.doesNotMatch(pricing, /BAA available/);
  assert.match(
    pricing,
    /repository or plan selection does not by itself establish HIPAA compliance/,
  );
  assert.doesNotMatch(homepage, /up to 100 minutes of calls/);
  assert.doesNotMatch(faq, /up to 100 minutes of calls/);
  assert.match(pricing, /15 browser-only minutes/);
  assert.match(hipaa, /HIPAA is a deployment outcome, not a repository badge/);
  assert.match(
    hipaa,
    /open-source repository does not by itself establish HIPAA/,
  );
  assert.doesNotMatch(hipaa, /fully HIPAA compliant/i);
});

test("desktop nav, FAQ accordions, and landmarks are keyboard-accessible", () => {
  const header = read("src/components/mvpblocks/header-1.tsx");
  const faq = read("src/components/mvpblocks/faq-2.tsx");
  const layout = read("src/app/layout.tsx");
  const home = read("src/app/page.tsx");

  assert.doesNotMatch(header, /href:\s*"#"/);
  assert.match(header, /onFocus/);
  assert.match(header, /onKeyDown/);
  assert.match(header, /aria-expanded/);
  assert.match(header, /aria-controls/);

  assert.match(faq, /aria-expanded/);
  assert.match(faq, /aria-controls/);

  assert.equal((layout.match(/<main/g) ?? []).length, 0);
  assert.match(layout, /<div id=["']main-content["']/);
  assert.doesNotMatch(home, /<main[^>]+id=["']main-content["']/);
});

test("inert careers buttons are removed and blog SearchAction has search handling", () => {
  const careersFiles = [
    "src/components/landing/careers/careers-hero-section.tsx",
    "src/components/landing/careers/careers-benefits-section.tsx",
    "src/components/landing/careers/careers-job-opportunities-section.tsx",
  ];

  for (const file of careersFiles) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /<button[\s\S]*?(Watch Our Story|View All Benefits|Apply Now)[\s\S]*?<\/button>/,
      `${relative(WEB_ROOT, join(WEB_ROOT, file))} still renders an inert button`,
    );
  }

  const blogPage = read("src/app/blog/page.tsx");
  assert.match(read("src/app/page.tsx"), /"@type": "SearchAction"/);
  assert.match(blogPage, /searchParams/);
  assert.match(blogPage, /name="q"/);
  assert.match(blogPage, /filteredPosts/);
});

test("global layout does not preload homepage-only dashboard art", () => {
  assert.doesNotMatch(read("src/app/layout.tsx"), /rel=["']preload["'][^>]+\/dashboard\.png/);
  assert.match(read("src/components/mvpblocks/3dglobe.tsx"), /priority/);
});

test("conversion CTA clicks have analytics instrumentation without hard dependency", () => {
  const layout = read("src/app/layout.tsx");
  const analytics = read("src/components/cta-analytics.tsx");

  assert.match(layout, /CtaAnalytics/);
  assert.match(analytics, /cta_click/);
  assert.match(analytics, /window\.gtag/);
  assert.match(analytics, /CONTACT_URL/);
  assert.match(analytics, /DEMO_BOOKING_URL/);
  assert.match(analytics, /REGISTER_URL/);
});

test("legacy /register conversion paths resolve to the external console signup", () => {
  const nextConfig = read("next.config.ts");
  const robots = read("public/robots.txt");
  const markdownRenderer = read("src/components/blog/MarkdownRenderer.tsx");
  const contentFiles = walk(join(WEB_ROOT, "content"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => relative(WEB_ROOT, file));

  assert.match(nextConfig, /async\s+redirects\(\)/);
  assert.match(nextConfig, /source:\s*["']\/register["']/);
  assert.match(nextConfig, /https:\/\/console\.quickvoice\.co/);
  assert.match(nextConfig, /destination:\s*`\$\{consoleUrl\}\/register`/);
  assert.doesNotMatch(robots, /Disallow:\s*\/register\b/);
  assert.match(markdownRenderer, /REGISTER_URL/);
  assert.match(markdownRenderer, /href\s*===\s*["']\/register["']/);

  for (const file of contentFiles) {
    assert.doesNotMatch(
      read(file),
      /\]\(\/register\)/,
      `${file} still links markdown readers to the unavailable marketing /register route`,
    );
  }
});

test("homepage contact form posts through the app contact route with accessible status", () => {
  const homepageContact = read("src/components/mvpblocks/contact-us-1.tsx");

  assert.match(homepageContact, /fetch\(["']\/api\/contact["']/);
  assert.doesNotMatch(homepageContact, /mailto:/);
  assert.doesNotMatch(homepageContact, /window\.open/);
  assert.match(homepageContact, /aria-live=["']polite["']/);
  assert.match(homepageContact, /role=["']alert["']/);
  assert.match(homepageContact, /role=["']status["']/);
  assert.match(homepageContact, /aria-invalid/);
  assert.match(homepageContact, /aria-describedby/);
});

test("dedicated contact form associates validation errors with fields", () => {
  const contactPageForm = read(
    "src/components/landing/contact-us/contact-us-form-section.tsx",
  );

  for (const field of ["name", "email", "phone", "lookingFor", "message"]) {
    assert.match(contactPageForm, new RegExp(`id=["']${field}-error["']`));
    assert.match(
      contactPageForm,
      new RegExp(`aria-describedby=\\{errors\\.${field}\\s*\\?\\s*["']${field}-error["']`),
    );
    assert.match(
      contactPageForm,
      new RegExp(`aria-invalid=\\{Boolean\\(errors\\.${field}\\)\\}`),
    );
  }
});

test("known sales and education card affordances are real links, not inert buttons", () => {
  const inertAffordanceFiles = [
    "src/components/landing/sales-lead-gen/sales-lead-gen-touchpoints-section.tsx",
    "src/components/landing/education/education-features-section.tsx",
  ];

  for (const file of inertAffordanceFiles) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /<button[\s\S]*?(Learn More|LEARN MORE)[\s\S]*?<\/button>/,
      `${file} still renders an inert Learn More button`,
    );
    assert.match(source, /<Link[\s\S]+href=/);
  }
});
