#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const TARGETS = ["apps/web/src", "apps/web/content", "apps/web/public"];
const EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".jsx",
  ".md",
  ".mdx",
  ".ts",
  ".tsx",
  ".txt",
]);
const ALLOW_MARKER = "claims-audit: allow";

const SAFE_CONTEXT =
  /\b(?:does not (?:by itself )?(?:establish|prove|claim)|does not claim that|not (?:a|an|automatically|by itself|verified|guaranteed)|has not been validated|have not been validated|not been validated|depends on|illustrative|unverified|not verified|not customer proof|do not cite|must not be cited|requires (?:a |the )?(?:full )?review|before publishing a claim|no certification claim|not a standalone|should not claim|without public evidence)\b/i;

const RULES = [
  {
    id: "CERTIFICATION",
    description:
      "Certification or regulatory status stated as a QuickVoice fact",
    pattern:
      /\b(?:(?:quickvoice|we|our|the platform).{0,100})?(?:hipaa|soc ?2|pci dss|iso ?27001|hitrust|gdpr|ccpa).{0,80}\b(?:compliant|compliance|certified|certification|ready|aligned|attestation|baa available|sign(?:ed|s)? (?:a )?baa)\b|\b(?:hipaa|soc ?2|pci dss|iso ?27001|hitrust|gdpr|ccpa)[-\s](?:compliant|certified|ready|aligned)\b/i,
  },
  {
    id: "ADOPTION",
    description: "Unsupported customer, company, or adoption count",
    pattern:
      /\b(?:join|trusted by|serves?|used by|powers?)\b.{0,100}\b(?:hundreds|thousands|\d{2,}[+,]?)\b.{0,60}\b(?:businesses|companies|customers|organizations|teams|users)\b|\b(?:hundreds|thousands|\d{2,}[+,]?)\b.{0,60}\b(?:businesses|companies|customers|organizations|teams|users)\b.{0,100}\b(?:trust|use|using|choose|deploy)\b/i,
  },
  {
    id: "LANGUAGE_COUNT",
    description: "Unsupported language-count or automatic-detection claim",
    pattern:
      /\b(?:100\+|over 100|80\+|50[-–]80\+)\s+(?:languages|languages and dialects)\b|\bautomatically detect(?:s|ed|ing)?\b.{0,50}\blanguage\b/i,
  },
  {
    id: "DEPLOYMENT_SPEED",
    description: "Unsupported setup or deployment-speed promise",
    pattern:
      /\b(?:live|deploy(?:ed|ment)?|setup|set up|go live|up and running|first agent)\b.{0,90}\b(?:under|within|in)\s+\d+\s*(?:minutes?|hours?|days?|weeks?)\b/i,
  },
  {
    id: "INTEGRATION",
    description: "Unsupported native or seamless integration claim",
    pattern:
      /\b(?:native|seamless|direct)\s+integration(?:s)?\b|\bintegrates? (?:natively|seamlessly|directly)\b/i,
  },
  {
    id: "ABSOLUTE_OUTCOME",
    description: "Absolute service, concurrency, or availability promise",
    pattern:
      /\b(?:never miss(?: a call)?|every call(?:,? every time)?|zero hold time|unlimited concurrent calls|no setup|no coding required|no technical expertise|required no technical|guaranteed|100% uptime)\b/i,
  },
  {
    id: "QUICKVOICE_METRIC",
    description: "Percentage or ROI represented as a QuickVoice outcome",
    pattern:
      /\bquickvoice\b.{0,140}\b(?:\d{1,3}(?:\.\d+)?%|\d+(?:\.\d+)?x|(?:average|avg\.?)\s+roi|roi\s*[:=]\s*\d+|saved? \$[\d,]+)\b|\b(?:\d{1,3}(?:\.\d+)?%|\d+(?:\.\d+)?x|(?:average|avg\.?)\s+roi|roi\s*[:=]\s*\d+|saved? \$[\d,]+)\b.{0,140}\bquickvoice\b/i,
  },
];

function collectFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      files.push(...collectFiles(absolutePath));
    } else if (EXTENSIONS.has(extname(entry).toLowerCase())) {
      files.push(absolutePath);
    }
  }

  return files;
}

function requestedTargets(argv) {
  const targets = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--target") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(
          "--target requires a repository-relative file or directory.",
        );
      }
      targets.push(value);
      index += 1;
    } else if (argument.startsWith("--target=")) {
      const value = argument.slice("--target=".length);
      if (!value) {
        throw new Error(
          "--target requires a repository-relative file or directory.",
        );
      }
      targets.push(value);
    }
  }

  return targets.length > 0 ? targets : TARGETS;
}

function collectTarget(target) {
  const absolutePath = resolve(ROOT, target);
  const rootPrefix = ROOT.endsWith(sep) ? ROOT : `${ROOT}${sep}`;

  if (absolutePath !== ROOT && !absolutePath.startsWith(rootPrefix)) {
    throw new Error(`Target must stay inside the repository: ${target}`);
  }
  if (!existsSync(absolutePath)) {
    throw new Error(`Target does not exist: ${target}`);
  }

  const stats = statSync(absolutePath);
  if (stats.isDirectory()) return collectFiles(absolutePath);
  if (EXTENSIONS.has(extname(absolutePath).toLowerCase()))
    return [absolutePath];

  throw new Error(`Target is not a supported public-content file: ${target}`);
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function excerpt(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function claimLines(file, text) {
  const lines = text.split(/\r?\n/);
  if (![".md", ".mdx"].includes(extname(file).toLowerCase())) return lines;

  // Retained URL identities are not prose. Keep every other metadata field,
  // link label/title, and the original line positions available to the audit.
  const frontmatterEnd =
    lines[0] === "---"
      ? lines.findIndex(
          (line, index) => index > 0 && /^(?:---|\.\.\.)$/.test(line),
        )
      : -1;
  let fence;
  return lines.map((line, index) => {
    if (index > 0 && index < frontmatterEnd) {
      const field = line.match(
        /^(slug|canonical):[ \t]*(?:"([^"]*)"|'([^']*)'|([^ \t#]+))[ \t]*$/,
      );
      if (field) {
        const value = field[2] ?? field[3] ?? field[4];
        if (field[1] === "slug" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
          return "";
        if (field[1] === "canonical") {
          try {
            if (/^https?:$/.test(new URL(value).protocol)) return "";
          } catch {
            /* Malformed metadata remains subject to the prose audit. */
          }
        }
      }
      return line;
    }

    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (
        delimiter[1][0] === fence[0] &&
        delimiter[1].length >= fence.length
      )
        fence = undefined;
      return line;
    }
    if (fence) return line;
    // Link-like text in code, escaped syntax, and block quotes may be visible.
    // Keep these ambiguous cases in the scan instead of guessing at rendering.
    if (
      line.includes("`") ||
      line.includes("\\") ||
      /^(?: {4}| {0,3}\t| {0,3}>)/.test(line)
    )
      return line;
    return line.replace(
      /(\[[^\]\n]*\]\()((?:https?:\/\/|\/)[^\s()\n]+)((?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?[ \t]*\))/g,
      "$1$3",
    );
  });
}

function auditFile(file) {
  const text = readFileSync(file, "utf8");
  const lines = claimLines(file, text);
  const findings = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.includes(ALLOW_MARKER)) {
      findings.push({
        rule: "UNSUPPORTED_EXCEPTION",
        description: "Suppression markers cannot establish an approved claim",
        file: relative(ROOT, file).replaceAll("\\", "/"),
        line: index + 1,
        excerpt: excerpt(line),
      });
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const window = lines.slice(index, index + 3).join(" ");
    const context = lines
      .slice(Math.max(0, index - 2), Math.min(lines.length, index + 5))
      .join(" ");
    if (!window.trim() || SAFE_CONTEXT.test(context)) {
      continue;
    }

    for (const rule of RULES) {
      const match = window.match(rule.pattern);
      if (!match) continue;

      findings.push({
        rule: rule.id,
        description: rule.description,
        file: relative(ROOT, file).replaceAll("\\", "/"),
        line: index + lineNumberAt(window, match.index ?? 0),
        excerpt: excerpt(match[0]),
      });
    }
  }

  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.rule}:${finding.file}:${finding.excerpt.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

let targets;
let files;

try {
  targets = requestedTargets(process.argv.slice(2));
  files = [...new Set(targets.flatMap(collectTarget))];
} catch (error) {
  process.stderr.write(`[claims-audit] ERROR: ${error.message}\n`);
  process.exitCode = 2;
  process.exit();
}

const findings = files.flatMap(auditFile);
const asJson = process.argv.includes("--json");

if (asJson) {
  process.stdout.write(
    `${JSON.stringify(
      {
        scannedFiles: files.length,
        findingCount: findings.length,
        findings,
      },
      null,
      2,
    )}\n`,
  );
} else if (findings.length === 0) {
  process.stdout.write(
    `[claims-audit] PASS: ${files.length} public content files scanned; no blocked claims found.\n`,
  );
} else {
  const ruleCounts = findings.reduce((counts, finding) => {
    counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
    return counts;
  }, {});
  const maxPrintedFindings = 150;

  process.stdout.write(
    `[claims-audit] BLOCKED: ${findings.length} potential unsupported public claims across ${files.length} files.\n\n`,
  );
  process.stdout.write(
    `${Object.entries(ruleCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([rule, count]) => `${rule}=${count}`)
      .join("  ")}\n\n`,
  );
  for (const finding of findings.slice(0, maxPrintedFindings)) {
    process.stdout.write(
      `${finding.file}:${finding.line} [${finding.rule}] ${finding.description}\n  ${finding.excerpt}\n`,
    );
  }
  if (findings.length > maxPrintedFindings) {
    process.stdout.write(
      `\n... ${findings.length - maxPrintedFindings} additional findings omitted. Run with --json for the complete result.\n`,
    );
  }
  process.stdout.write(
    `\nResolve each claim with public evidence or rewrite it. Suppression markers are rejected; rewrite the claim and record sources in the editorial review.\n`,
  );
}

process.exitCode = findings.length > 0 ? 1 : 0;
