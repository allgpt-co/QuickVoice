#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  computeContentHash,
  isValidEvidenceReview,
} from "../apps/web/src/lib/blog-review.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const matter = require("gray-matter");
const routes = [
  "",
  "solutions/ai-receptionist",
  "solutions/ai-answering-service",
  "use-cases/appointment-scheduling",
  "use-cases/customer-support",
  "use-cases/sales-lead-gen",
  "industries/real-estate",
  "industries/hr-recruiting",
  "industries/saas",
  "industries/automotive",
  "pricing",
  "company/contact",
  "open-source",
  "blog",
  "blog/[slug]",
];
const selected = new Set([
  "free-ai-appointment-scheduling-tools",
  "best-ai-voice-agent-platforms-2026",
  "ai-appointment-scheduling-guide",
  "ai-phone-answering-service-small-business",
  "automated-appointment-reminders-guide",
  "ai-voice-agents-reduce-customer-support-costs",
  "ai-voice-agents-b2b-lead-qualification",
  "ai-voice-agents-property-management",
  "build-ai-voice-agent-small-business",
  "ai-voice-agent-security-data-privacy",
  "retell-ai-alternatives",
  "vapi-alternatives",
]);
const files = new Set();

function visit(file) {
  if (files.has(file)) return;
  files.add(file);
  const source = readFileSync(file, "utf8");
  // Follow static local module references, including Next's literal dynamic imports.
  for (const match of source.matchAll(
    /(?:from\s*|import\s*\(\s*|import\s*)["']([^"']+)["']/g,
  )) {
    const ref = match[1];
    const base = ref.startsWith("@/data/")
      ? resolve(root, "apps/web/data", ref.slice(7))
      : ref.startsWith("@/")
        ? resolve(root, "apps/web/src", ref.slice(2))
        : ref.startsWith(".")
          ? resolve(dirname(file), ref)
          : null;
    if (!base) continue;
    const dependency = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.mjs`,
      join(base, "index.ts"),
      join(base, "index.tsx"),
    ].find(
      (path) =>
        /\.(?:tsx?|mjs)$/.test(path) &&
        existsSync(path) &&
        statSync(path).isFile(),
    );
    if (dependency) visit(dependency);
  }
}

try {
  for (const route of routes)
    visit(resolve(root, "apps/web/src/app", route, "page.tsx"));
  visit(resolve(root, "apps/web/src/app/layout.tsx"));
  for (const industry of ["hr-recruiting", "saas", "automotive"])
    visit(resolve(root, "apps/web/content/industries", `${industry}.md`));
  const contentDirectory = resolve(root, "apps/web/content/blog");
  const found = new Set();
  for (const name of readdirSync(contentDirectory).filter((name) =>
    name.endsWith(".md"),
  )) {
    const file = join(contentDirectory, name);
    const { data, content } = matter(readFileSync(file, "utf8"));
    if (!selected.has(data.slug) && !data.evidenceReview) continue;
    if (
      !isValidEvidenceReview(
        data.evidenceReview,
        computeContentHash(data, content),
      )
    ) {
      throw new Error(
        `Article needs a current source review: ${relative(root, file)}`,
      );
    }
    found.add(data.slug);
    files.add(file);
  }
  for (const slug of selected)
    if (!found.has(slug)) throw new Error(`Missing campaign article: ${slug}`);
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, "scripts/audit-public-claims.mjs"),
      ...process.argv.slice(2),
      ...[...files].flatMap((file) => ["--target", relative(root, file)]),
    ],
    { cwd: root, encoding: "utf8" },
  );
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`SEO campaign check failed: ${error.message}\n`);
  process.exitCode = 1;
}
