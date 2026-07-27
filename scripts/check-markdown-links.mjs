#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "vendor",
]);
const EXCLUDED_PREFIXES = ["apps/server/prisma/generated/"];
const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || REPO_ROOT);
const files = args.files.length > 0 ? args.files : await listMarkdownFiles(root);
const errors = [];
const headingCache = new Map();

for (const file of files) {
  if (isExcluded(file)) continue;
  await checkFile(file);
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`[ok] checked ${files.filter((file) => !isExcluded(file)).length} Markdown files`);

function parseArgs(argv) {
  const parsed = { root: "", files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      parsed.root = argv[index + 1] || "";
      if (!parsed.root) failUsage("--root requires a directory");
      index += 1;
      continue;
    }
    if (arg === "--file") {
      const file = argv[index + 1] || "";
      if (!file) failUsage("--file requires a Markdown path");
      parsed.files.push(normalizeRelative(file));
      index += 1;
      continue;
    }
    failUsage(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function failUsage(message) {
  console.error(`[fail] ${message}`);
  process.exit(2);
}

async function listMarkdownFiles(rootDir) {
  if (!args.root) {
    const tracked = await gitTrackedMarkdown();
    if (tracked.length > 0) return tracked;
  }

  const found = [];
  await walk(rootDir, "", found);
  return found;
}

async function gitTrackedMarkdown() {
  return new Promise((resolve) => {
    execFile("git", ["ls-files", "-z", "--", "*.md"], { cwd: root }, (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }
      resolve(stdout.split("\0").filter(Boolean).map(normalizeRelative));
    });
  });
}

async function walk(dir, relativeDir, found) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relativePath = normalizeRelative(path.join(relativeDir, entry.name));
    if (isExcluded(relativePath)) continue;
    const absolutePath = path.join(root, relativePath);
    if (entry.isDirectory()) {
      await walk(absolutePath, relativePath, found);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      found.push(relativePath);
    }
  }
}

async function checkFile(file) {
  const absoluteFile = path.join(root, file);
  const source = await readFile(absoluteFile, "utf8");
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    for (const target of extractTargets(lines[index])) {
      await checkTarget({ sourceFile: file, line: index + 1, target });
    }
  }
}

function extractTargets(line) {
  const targets = [];
  const inline = /(!)?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of line.matchAll(inline)) {
    if (match[1] === "!") continue;
    const target = stripTitle(match[2].trim());
    if (target) targets.push(target);
  }

  const reference = /^\s{0,3}\[[^\]]+\]:\s+(\S+)/;
  const refMatch = line.match(reference);
  if (refMatch?.[1]) targets.push(stripTitle(refMatch[1].trim()));
  return targets;
}

function stripTitle(target) {
  const unwrapped = target.replace(/^<(.+)>$/, "$1");
  return unwrapped.split(/\s+(?=["'])/)[0];
}

async function checkTarget({ sourceFile, line, target }) {
  const cleaned = target.trim();
  if (shouldIgnoreTarget(cleaned)) return;

  const [rawPath, rawFragment = ""] = cleaned.split("#", 2);
  const decodedFragment = decodeFragment(rawFragment);
  const resolved = rawPath
    ? normalizeRelative(path.join(path.dirname(sourceFile), decodePath(rawPath)))
    : sourceFile;

  if (isExcluded(resolved)) return;

  try {
    const info = await stat(path.join(root, resolved));
    if (!info.isFile() && !info.isDirectory()) {
      recordMissing(sourceFile, line, cleaned, resolved);
      return;
    }
  } catch {
    recordMissing(sourceFile, line, cleaned, resolved);
    return;
  }

  if (decodedFragment && !(await hasHeading(resolved, decodedFragment))) {
    errors.push(`${sourceFile}:${line} missing heading #${decodedFragment} in ${resolved}`);
  }
}

function shouldIgnoreTarget(target) {
  if (!target || target.startsWith("#:") || target.startsWith("<")) return true;
  if (/^(https?:|mailto:|tel:|data:|ftp:)/i.test(target)) return true;
  if (/^\{\{.*\}\}$/.test(target) || /^<[^>]+>$/.test(target)) return true;
  if (target.includes("YOUR_") || target.includes("your-")) return true;
  return false;
}

async function hasHeading(file, fragment) {
  const anchors = await headingsFor(file);
  return anchors.has(slugify(fragment));
}

async function headingsFor(file) {
  if (headingCache.has(file)) return headingCache.get(file);
  const body = await readFile(path.join(root, file), "utf8");
  const anchors = new Set();
  const counts = new Map();

  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const base = slugify(match[1]);
    const count = counts.get(base) || 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }

  headingCache.set(file, anchors);
  return anchors;
}

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeFragment(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch {
    return value;
  }
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function normalizeRelative(value) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isExcluded(relativePath) {
  const normalized = normalizeRelative(relativePath);
  if (normalized.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment))) return true;
  return EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function recordMissing(sourceFile, line, target, resolved) {
  errors.push(`${sourceFile}:${line} missing target ${target} -> ${resolved}`);
}
