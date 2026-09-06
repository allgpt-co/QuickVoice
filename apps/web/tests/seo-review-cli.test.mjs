import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { computeContentHash, isValidEvidenceReview } from "../src/lib/blog-review.mjs";

const require = createRequire(import.meta.url);
const matter = require("gray-matter");
const repositoryRoot = new URL("../../../", import.meta.url);

test("article review CLI issues current content-bound records only after a passing audit", (t) => {
  const root = mkdtempSync(join(tmpdir(), "quickvoice-seo-review-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ["scripts", "apps/web/src/lib", "apps/web/content/blog"]) mkdirSync(join(root, directory), { recursive: true });
  for (const file of ["scripts/review-seo-article.mjs", "scripts/audit-public-claims.mjs", "apps/web/src/lib/blog-review.mjs"]) copyFileSync(new URL(file, repositoryRoot), join(root, file));
  mkdirSync(join(root, "apps/web/node_modules"));
  symlinkSync(dirname(require.resolve("gray-matter/package.json")), join(root, "apps/web/node_modules/gray-matter"), "dir");
  writeFileSync(join(root, "apps/web/package.json"), "{}\n");
  const article = "apps/web/content/blog/fixture.md";
  const original = '---\ntitle: "Voice agent evaluation"\nslug: "fixture"\ndate: "2026-01-01"\n---\n\nRead the repository to evaluate the setup requirements.\n';
  const execute = (...args) => spawnSync(process.execPath, ["scripts/review-seo-article.mjs", article, ...args], { cwd: root, encoding: "utf8" });
  const reviewArgs = ["--reviewer", "Test reviewer", "--source", "https://github.com/allgpt-co/QuickVoice"];
  writeFileSync(join(root, article), original);
  let result = execute(...reviewArgs);
  assert.equal(result.status, 0, result.stderr);
  const approved = matter(readFileSync(join(root, article), "utf8"));
  assert.equal(approved.data.date, "2026-01-01");
  assert.equal(approved.content, matter(original).content);
  assert.equal(isValidEvidenceReview(approved.data.evidenceReview, computeContentHash(approved.data, approved.content)), true);

  for (const suffix of ["\nQuickVoice is HIPAA compliant.\n", "\n<!-- claims-audit: allow MADE-UP -->\n"]) {
    const rejected = `${original}${suffix}`;
    writeFileSync(join(root, article), rejected);
    result = execute(...reviewArgs);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(join(root, article), "utf8"), rejected);
  }
  writeFileSync(join(root, article), original);
  assert.notEqual(execute("--reviewer", "Test reviewer").status, 0);
  assert.notEqual(execute("--source", "https://example.com").status, 0);
  assert.equal(readFileSync(join(root, article), "utf8"), original);
});
