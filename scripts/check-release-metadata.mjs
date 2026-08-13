#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_SECTIONS = [
  "Status",
  "Install For Evaluation",
  "Known Limitations",
  "Verification Status",
];

function parseArgs(argv) {
  const options = {
    draft: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    version: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--draft") {
      options.draft = true;
    } else if (arg === "--root") {
      index += 1;
      options.root = argv[index];
    } else if (arg?.startsWith("--root=")) {
      options.root = arg.slice("--root=".length);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg?.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!options.version) {
      options.version = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return `Usage: node scripts/check-release-metadata.mjs [--root PATH] <version> [--draft]

Checks that release notes, changelog headings, and readiness sections agree before a tag is created.

Examples:
  pnpm release:check -- v0.1.0 --draft
  pnpm release:check -- v0.1.0
`;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function exists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function hasHeading(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, "im").test(markdown);
}

function hasRequiredSection(markdown, section) {
  if (hasHeading(markdown, section)) {
    return true;
  }
  if (section === "Status") {
    return /^>\s*\*\*Status:/im.test(markdown);
  }
  return false;
}

async function readRequired(path, label) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(
      `${label} is missing or unreadable at ${path}: ${error.message}`,
    );
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.version) {
    throw new Error("Candidate version is required.\n\n" + usage());
  }

  const root = resolve(options.root);
  const version = options.version;
  const changelogPath = resolve(root, "CHANGELOG.md");
  const releaseDir = resolve(root, "docs", "releases");
  const notesPath = resolve(releaseDir, `${version}.md`);
  const draftNotesPath = resolve(releaseDir, `${version}-draft.md`);

  if (options.draft) {
    const draft = await readRequired(draftNotesPath, "Draft release notes");
    const missing = REQUIRED_SECTIONS.filter(
      (section) => !hasRequiredSection(draft, section),
    );
    if (missing.length > 0) {
      throw new Error(
        `Draft release notes ${draftNotesPath} missing required section(s): ${missing.join(", ")}`,
      );
    }
    if (!/draft|not released/i.test(draft)) {
      throw new Error(
        `Draft release notes ${draftNotesPath} must explicitly say the candidate is draft/not released`,
      );
    }
    if (await exists(notesPath)) {
      throw new Error(
        `Draft mode expected ${version}-draft.md only, but found publish notes ${notesPath}`,
      );
    }
    console.log(`${version}: draft release notes found at ${draftNotesPath}`);
    console.log(
      `${version}: no published release claimed; draft mode does not create tags or releases`,
    );
    return;
  }

  const changelog = await readRequired(changelogPath, "CHANGELOG.md");
  if (
    !hasHeading(changelog, version) &&
    !new RegExp(
      `^##\\s+${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "im",
    ).test(changelog)
  ) {
    throw new Error(
      `CHANGELOG.md does not contain a release heading for ${version}`,
    );
  }

  const notes = await readRequired(notesPath, "Release notes");
  if (!hasHeading(notes, `QuickVoice ${version}`)) {
    throw new Error(
      `Release notes title in ${notesPath} must be "# QuickVoice ${version}"`,
    );
  }

  if (/draft|not released/i.test(notes)) {
    throw new Error(
      `${notesPath} still contains draft/not released wording; publish notes must be final`,
    );
  }

  const missing = REQUIRED_SECTIONS.filter(
    (section) => !hasRequiredSection(notes, section),
  );
  if (missing.length > 0) {
    throw new Error(
      `${notesPath} missing required section(s): ${missing.join(", ")}`,
    );
  }

  console.log(`${version}: CHANGELOG.md heading found`);
  console.log(`${version}: release notes file found at ${notesPath}`);
  for (const section of REQUIRED_SECTIONS) {
    console.log(`${version}: required section present: ${section}`);
  }
  console.log(
    `${version}: release metadata check passed; no tag, release, commit, or remote change created`,
  );
}

try {
  await run();
} catch (error) {
  fail(error.message);
}
