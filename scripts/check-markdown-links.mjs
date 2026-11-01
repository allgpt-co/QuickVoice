#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXCLUDED_DIRS = new Set([
  ".git",
  ".claude",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "out",
]);

const EXCLUDED_FILES = new Set(["audit.md", "ui_ux_audit.md"]);

const IGNORED_SCHEMES = /^(?:https?:|mailto:|tel:|data:|javascript:|#?$)/i;

function parseArgs(argv) {
  const args = { root: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") {
      args.root = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

function isInsideRoot(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
}

async function walkMarkdown(root, dir = root) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        files.push(...(await walkMarkdown(root, join(dir, entry.name))));
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const path = relative(root, join(dir, entry.name)).split(sep).join("/");
      if (!EXCLUDED_FILES.has(path)) files.push(path);
    }
  }
  return files;
}

async function listMarkdownFiles(root) {
  const git = spawnSync("git", ["-C", root, "ls-files", "*.md"], {
    encoding: "utf8",
  });
  if (git.status === 0) {
    return git.stdout
      .split("\n")
      .filter(Boolean)
      .filter(
        (path) => !path.split("/").some((part) => EXCLUDED_DIRS.has(part)),
      )
      .filter((path) => !EXCLUDED_FILES.has(path))
      .sort();
  }
  return (await walkMarkdown(root)).sort();
}

function stripMarkdownFormatting(text) {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_~]/g, "");
}

function slugForHeading(text) {
  return stripMarkdownFormatting(text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "");
}

function headingSlugs(markdown) {
  const slugs = new Set();
  const seen = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const explicitId = /\s\{#([^}]+)\}\s*$/.exec(match[2]);
    if (explicitId) slugs.add(explicitId[1].toLowerCase());
    const headingText = explicitId
      ? match[2].slice(0, explicitId.index)
      : match[2];
    const base = slugForHeading(headingText);
    if (!base) continue;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function markdownLinks(markdown) {
  const links = [];
  const pattern =
    /!?\[[^\]\n]*(?:\][^\[\]\n]*\[[^\]\n]*)*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of markdown.matchAll(pattern)) {
    links.push({
      href: match[1],
      line: lineNumberAt(markdown, match.index ?? 0),
    });
  }
  return links;
}

function splitHref(href) {
  if (href.startsWith("<") && href.endsWith(">")) {
    href = href.slice(1, -1);
  }
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) return { target: href, fragment: "" };
  return {
    target: href.slice(0, hashIndex),
    fragment: href.slice(hashIndex + 1),
  };
}

async function main() {
  const { root: rawRoot } = parseArgs(process.argv.slice(2));
  const root = resolve(rawRoot);
  const files = await listMarkdownFiles(root);
  const markdownByFile = new Map();
  const slugsByFile = new Map();
  const failures = [];

  for (const file of files) {
    const markdown = await readFile(join(root, file), "utf8");
    markdownByFile.set(file, markdown);
    slugsByFile.set(file, headingSlugs(markdown));
  }

  for (const file of files) {
    const markdown = markdownByFile.get(file);
    for (const { href, line } of markdownLinks(markdown)) {
      if (IGNORED_SCHEMES.test(href)) continue;
      const { target, fragment } = splitHref(href);
      if (!target && fragment) {
        const decodedFragment = decodeURIComponent(fragment).toLowerCase();
        if (!slugsByFile.get(file)?.has(decodedFragment)) {
          failures.push(`${file}:${line} missing heading #${fragment}`);
        }
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;

      const withoutQuery = target.split("?")[0];
      const resolvedTarget = resolve(
        dirname(join(root, file)),
        decodeURIComponent(withoutQuery),
      );
      if (!isInsideRoot(root, resolvedTarget)) continue;
      if (!existsSync(resolvedTarget)) {
        failures.push(`${file}:${line} missing target ${target}`);
        continue;
      }
      if (
        fragment &&
        statSync(resolvedTarget).isFile() &&
        resolvedTarget.endsWith(".md")
      ) {
        const relTarget = relative(root, resolvedTarget).split(sep).join("/");
        const decodedFragment = decodeURIComponent(fragment).toLowerCase();
        if (!slugsByFile.get(relTarget)?.has(decodedFragment)) {
          failures.push(
            `${file}:${line} missing heading ${target}#${fragment}`,
          );
        }
      }
    }
  }

  if (failures.length) {
    console.error("Broken Markdown links found:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`Checked ${files.length} Markdown files.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
