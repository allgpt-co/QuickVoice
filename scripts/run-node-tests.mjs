#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error("Usage: node scripts/run-node-tests.mjs <test-dir-or-file> [...]");
  process.exit(1);
}

function collectTestFiles(path) {
  const stats = statSync(path);
  if (stats.isFile()) return path.endsWith(".test.mjs") ? [path] : [];
  if (!stats.isDirectory()) return [];

  return readdirSync(path)
    .flatMap((entry) => collectTestFiles(join(path, entry)))
    .sort((left, right) => left.localeCompare(right));
}

const files = roots.flatMap(collectTestFiles);
if (files.length === 0) {
  console.error(`No .test.mjs files found in: ${roots.join(", ")}`);
  process.exit(1);
}

const testArgs = files.map((file) => relative(process.cwd(), file));
console.log(`Running ${testArgs.length} Node test file${testArgs.length === 1 ? "" : "s"}:`);
for (const file of testArgs) console.log(`- ${file}`);

const result = spawnSync(process.execPath, ["--test", ...testArgs], {
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
