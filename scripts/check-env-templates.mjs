#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || REPO_ROOT);
const files = args.files.length > 0 ? args.files : await listTemplates();
const records = [];
const byKey = new Map();
const errors = [];

for (const file of files) {
  await parseTemplate(file);
}

checkDuplicateValue("INTERNAL_API_KEY");
checkDuplicateValue("REDIS_URL");
checkDuplicateValue("LIVE_TRANSCRIPT_TTL_SECONDS");
checkDuplicateValue("AWS_REGION");
checkUrlAgreement("SERVER_URL", "NEXT_PUBLIC_SERVER_URL");
checkDerivedUrl("SERVER_URL", "SERVER_API_URL", "/api/v1");

for (const record of records.sort((a, b) => a.key.localeCompare(b.key) || a.file.localeCompare(b.file))) {
  console.log(`${record.key}\t${record.file}\tplaceholder=${record.placeholder ? "yes" : "no"}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`[ok] checked ${records.length} variables across ${files.length} templates`);

function parseArgs(argv) {
  const parsed = { root: "", files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      parsed.root = argv[index + 1] || "";
      if (!parsed.root) usage("--root requires a directory");
      index += 1;
      continue;
    }
    if (arg === "--file") {
      const file = argv[index + 1] || "";
      if (!file) usage("--file requires a template path");
      parsed.files.push(normalize(file));
      index += 1;
      continue;
    }
    usage(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function usage(message) {
  console.error(`[fail] ${message}`);
  process.exit(2);
}

async function listTemplates() {
  if (!args.root) {
    const tracked = await gitTrackedTemplates();
    if (tracked.length > 0) return tracked;
  }

  const found = [];
  await walk(root, "", found);
  return found;
}

function gitTrackedTemplates() {
  return new Promise((resolve) => {
    execFile("git", ["ls-files", "-z", "--", "*.env.dev.example"], { cwd: root }, (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }
      resolve(stdout.split("\0").filter(Boolean).map(normalize));
    });
  });
}

async function walk(dir, relativeDir, found) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", ".next", "dist", "build"].includes(entry.name)) continue;
    const relativePath = normalize(path.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      await walk(path.join(root, relativePath), relativePath, found);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".env.dev.example")) found.push(relativePath);
  }
}

async function parseTemplate(file) {
  const body = await readFile(path.join(root, file), "utf8");
  const lines = body.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    const record = { key, value, file, line: index + 1, placeholder: isPlaceholder(value) };
    records.push(record);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(record);
  }
}

function checkDuplicateValue(key) {
  const entries = byKey.get(key) || [];
  if (entries.length < 2) return;
  const [first] = entries;
  const mismatched = entries.filter((entry) => entry.value !== first.value);
  if (mismatched.length > 0) {
    errors.push(`${key} mismatch across ${entries.map((entry) => entry.file).join(", ")}`);
  }
}

function checkUrlAgreement(sourceKey, targetKey) {
  const source = firstValue(sourceKey);
  const targetEntries = byKey.get(targetKey) || [];
  if (!source || targetEntries.length === 0) return;
  for (const target of targetEntries) {
    if (target.value !== source.value) {
      errors.push(`${targetKey} must match ${sourceKey} (${target.file}:${target.line})`);
    }
  }
}

function checkDerivedUrl(sourceKey, derivedKey, suffix) {
  const source = firstValue(sourceKey);
  const derivedEntries = byKey.get(derivedKey) || [];
  if (!source || derivedEntries.length === 0) return;
  const expected = source.value.replace(/\/$/, "") + suffix;
  for (const derived of derivedEntries) {
    if (derived.value !== expected) {
      errors.push(`${derivedKey} must equal ${sourceKey}${suffix} (${derived.file}:${derived.line})`);
    }
  }
}

function firstValue(key) {
  const [first] = byKey.get(key) || [];
  return first;
}

function isPlaceholder(value) {
  const normalized = value.toLowerCase();
  return (
    value === "" ||
    normalized.includes("localhost") ||
    normalized.includes("dev") ||
    normalized.includes("placeholder") ||
    normalized.includes("change-me") ||
    normalized.includes("your-") ||
    normalized.includes("example")
  );
}

function normalize(value) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}
