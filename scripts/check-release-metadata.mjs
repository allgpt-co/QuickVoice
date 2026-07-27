#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArgs(process.argv.slice(2));
const version = normalizeVersion(options.version);
const root = path.resolve(options.root || REPO_ROOT);
const notesFile = `docs/releases/${version}${options.draft ? "-draft" : ""}.md`;
const notes = await readRequired(notesFile);

assertIncludes(notes, new RegExp(`^#\\s+QuickVoice\\s+${escapeRegExp(version)}\\s*$`, "m"), `${notesFile} title must match ${version}`);
assertIncludes(notes, /status/i, `${notesFile} must include release status`);
assertIncludes(notes, /install/i, `${notesFile} must include install requirements`);
assertIncludes(notes, /known limitations/i, `${notesFile} must include known limitations`);
assertIncludes(notes, /verification/i, `${notesFile} must include verification evidence`);

if (options.draft) {
  assertIncludes(notes, /draft|not released/i, `${notesFile} must remain explicit that ${version} is not released`);
  console.log(`[ok] draft release metadata is internally consistent for ${version}`);
} else {
  const changelog = await readRequired("CHANGELOG.md");
  assertIncludes(changelog, releaseHeading(version), `CHANGELOG.md must contain a release heading for ${version}`);
  if (/draft|not released/i.test(notes)) fail(`${notesFile} still contains draft/not released language`);
  console.log(`[ok] publish release metadata is internally consistent for ${version}`);
}

async function readRequired(relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    const info = await stat(absolutePath);
    if (!info.isFile()) fail(`${relativePath} is not a file`);
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      fail(`${relativePath} is missing`);
    }
    throw error;
  }
}

function parseArgs(args) {
  const parsed = { root: "", version: "", draft: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") {
      parsed.root = args[index + 1] || "";
      if (!parsed.root) usage("--root requires a directory");
      index += 1;
      continue;
    }
    if (arg === "--draft") {
      parsed.draft = true;
      continue;
    }
    if (arg === "--publish") continue;
    if (arg.startsWith("-")) usage(`Unknown argument: ${arg}`);
    if (parsed.version) usage("Only one candidate version is supported");
    parsed.version = arg;
  }
  if (!parsed.version) usage("Candidate version is required, for example v0.1.0");
  return parsed;
}

function normalizeVersion(value) {
  if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)) {
    usage("Candidate version must look like vMAJOR.MINOR.PATCH");
  }
  return value;
}

function releaseHeading(version) {
  return new RegExp(`^##\\s+(?:\\[)?${escapeRegExp(version)}(?:\\])?(?:\\s+-\\s+\\d{4}-\\d{2}-\\d{2})?\\s*$`, "m");
}

function assertIncludes(body, pattern, message) {
  if (!pattern.test(body)) fail(message);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function usage(message) {
  console.error(`[fail] ${message}`);
  process.exit(2);
}

function fail(message) {
  console.error(`[fail] ${message}`);
  process.exit(1);
}
