import { spawnSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";

const severityRank = {
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

const args = process.argv.slice(2);
const options = parseArgs(args);
const auditLevel = options.auditLevel;
if (!Object.hasOwn(severityRank, auditLevel)) {
  console.error(
    `Invalid --audit-level "${auditLevel}". Expected low, moderate, high, or critical.`
  );
  process.exit(2);
}
const threshold = severityRank[auditLevel];

const suppressionFile = options.suppressionFile;
const suppressionConfig = JSON.parse(await readFile(suppressionFile, "utf8"));
const suppressions = suppressionConfig.suppressions ?? [];
if (!Array.isArray(suppressions)) {
  console.error("Dependency audit suppressions must be an array.");
  process.exit(2);
}
const today = parseDateOnly(
  process.env.SECURITY_AUDIT_TODAY ?? new Date().toISOString().slice(0, 10),
  "SECURITY_AUDIT_TODAY"
);
const suppressionAnalysis = analyzeSuppressions(suppressions, today);
const activeSuppressions = suppressionAnalysis.active.map(({ suppression }) => suppression);

await reportSuppressions(suppressionAnalysis);

if (suppressionAnalysis.invalid.length > 0) {
  console.error("Invalid dependency audit suppressions found:");
  for (const item of suppressionAnalysis.invalid) {
    console.error(`- ${item.message}`);
  }
  process.exit(1);
}

if (suppressionAnalysis.expired.length > 0) {
  console.error("Expired dependency audit suppressions found:");
  for (const item of suppressionAnalysis.expired) {
    console.error(`- ${formatSuppression(item.suppression)} expired on ${item.expires}`);
  }
  process.exit(1);
}

if (options.checkSuppressionsOnly) {
  process.exit(0);
}

function parseArgs(rawArgs) {
  const parsed = {
    auditLevel: "low",
    checkSuppressionsOnly: false,
    suppressionFile: "security/audit-suppressions.json",
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--audit-level") {
      parsed.auditLevel = rawArgs[index + 1] ?? "high";
      index += 1;
    } else if (arg === "--suppressions-file") {
      parsed.suppressionFile = rawArgs[index + 1] ?? parsed.suppressionFile;
      index += 1;
    } else if (arg === "--check-suppressions-only") {
      parsed.checkSuppressionsOnly = true;
    } else {
      throw new Error(`Unknown security-audit argument: ${arg}`);
    }
  }

  return parsed;
}

function parseDateOnly(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD format. Received: ${value}`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid calendar date. Received: ${value}`);
  }

  return date;
}

function daysBetween(start, end) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function analyzeSuppressions(items, currentDate) {
  const active = [];
  const expired = [];
  const expiringSoon = [];
  const invalid = [];

  for (const suppression of items) {
    if (!suppression.expires) {
      invalid.push({
        suppression,
        message: `${formatSuppression(suppression)} is missing an expires date`,
      });
      continue;
    }

    let expiresDate;
    try {
      expiresDate = parseDateOnly(suppression.expires, `${formatSuppression(suppression)} expires`);
    } catch (error) {
      invalid.push({
        suppression,
        message: error.message,
      });
      continue;
    }

    const daysUntilExpiry = daysBetween(currentDate, expiresDate);
    const item = {
      suppression,
      daysUntilExpiry,
      expires: suppression.expires,
    };

    if (daysUntilExpiry < 0) {
      expired.push(item);
    } else {
      active.push(item);
      if (daysUntilExpiry <= 30) {
        expiringSoon.push(item);
      }
    }
  }

  return {
    active,
    expired,
    expiringSoon,
    invalid,
  };
}

function formatSuppression(suppression) {
  return `${suppression.module ?? "(any module)"} ${suppression.id ?? "(missing id)"}`;
}

async function reportSuppressions(analysis) {
  const lines = [
    "## Dependency audit suppressions",
    `- Active suppressions: ${analysis.active.length}`,
    `- Expired suppressions: ${analysis.expired.length}`,
    `- Expiring within 30 days: ${analysis.expiringSoon.length}`,
  ];

  if (analysis.expiringSoon.length > 0) {
    lines.push("", "### Expiring soon");
    for (const item of analysis.expiringSoon) {
      lines.push(`- ${formatSuppression(item.suppression)} expires on ${item.expires}`);
    }
  }

  if (analysis.expired.length > 0) {
    lines.push("", "### Expired");
    for (const item of analysis.expired) {
      lines.push(`- ${formatSuppression(item.suppression)} expired on ${item.expires}`);
    }
  }

  console.log(
    `Dependency audit suppressions: ${analysis.active.length} active, ${analysis.expired.length} expired, ${analysis.expiringSoon.length} expiring within 30 days.`
  );

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  }
}

function advisoryId(advisory) {
  return (
    advisory.github_advisory_id ??
    advisory.cves?.[0] ??
    advisory.id?.toString() ??
    advisory.url ??
    `${advisory.module_name}:${advisory.title}`
  );
}

function isSuppressed(advisory, context) {
  const id = advisoryId(advisory);
  return activeSuppressions.some((suppression) => {
    const contextMatches =
      suppression.contexts === undefined || suppression.contexts.includes(context);
    const moduleMatches =
      suppression.module === undefined || suppression.module === advisory.module_name;
    const idMatches =
      suppression.id === id ||
      suppression.id === advisory.github_advisory_id ||
      suppression.id === advisory.id?.toString() ||
      advisory.cves?.includes(suppression.id);
    return contextMatches && moduleMatches && idMatches && suppression.reason;
  });
}

function parseAuditJson(stdout) {
  const firstBrace = stdout.indexOf("{");
  if (firstBrace === -1) {
    return {};
  }
  return JSON.parse(stdout.slice(firstBrace));
}

function runAudit(context, extraArgs) {
  const result = spawnSync(
    "pnpm",
    ["audit", "--json", "--audit-level", auditLevel, ...extraArgs],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
  );

  if (result.error) {
    throw result.error;
  }

  const output = parseAuditJson(result.stdout);
  if (output.error || (result.status !== 0 && !Object.hasOwn(output, "advisories"))) {
    const details =
      output.error?.summary ??
      output.error?.message ??
      result.stderr.trim() ??
      result.stdout.trim() ??
      `pnpm audit exited with status ${result.status}`;
    throw new Error(`${context}: dependency audit could not complete: ${details}`);
  }

  const advisories = Object.values(output.advisories ?? {});
  const thresholdAdvisories = advisories.filter((advisory) => {
    const rank = severityRank[advisory.severity] ?? 0;
    return rank >= threshold;
  });
  const unsuppressed = thresholdAdvisories.filter(
    (advisory) => !isSuppressed(advisory, context)
  );
  const uniqueUnsuppressed = [
    ...new Map(
      unsuppressed.map((advisory) => [
        `${advisory.module_name}:${advisoryId(advisory)}:${advisory.title}`,
        advisory,
      ])
    ).values(),
  ];

  if (thresholdAdvisories.length === 0) {
    console.log(`${context}: no ${auditLevel}+ advisories found.`);
    return [];
  }

  if (uniqueUnsuppressed.length === 0) {
    console.log(`${context}: all ${auditLevel}+ advisories are explicitly suppressed.`);
    return [];
  }

  console.error(`${context}: ${uniqueUnsuppressed.length} unsuppressed ${auditLevel}+ advisories found.`);
  for (const advisory of uniqueUnsuppressed) {
    console.error(
      `- ${advisory.severity}: ${advisory.module_name} ${advisoryId(advisory)} ${advisory.title}`
    );
  }
  return uniqueUnsuppressed;
}

const productionFindings = runAudit("production dependencies", ["--prod"]);
const allFindings = runAudit("all dependencies", []);

if (productionFindings.length > 0 || allFindings.length > 0) {
  console.error(
    `Add a reviewed entry to ${suppressionFile} only for temporary, documented exceptions.`
  );
  process.exit(1);
}
