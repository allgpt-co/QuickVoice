import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = new URL("../", import.meta.url);
const releaseScript = new URL(
  "../scripts/check-release-metadata.mjs",
  import.meta.url,
);
const requiredSections = [
  "Status",
  "Install For Evaluation",
  "Known Limitations",
  "Verification Status",
];

async function writeFixture(
  root,
  { changelogVersion = "v0.1.0", notesVersion = "v0.1.0" } = {},
) {
  await mkdir(join(root, "docs", "releases"), { recursive: true });
  await writeFile(
    join(root, "CHANGELOG.md"),
    `# Changelog\n\n## ${changelogVersion} - 2026-07-31\n\n### Added\n\n- Release metadata.\n`,
  );
  await writeFile(
    join(root, "docs", "releases", `${notesVersion}.md`),
    `# QuickVoice ${notesVersion}\n\n## Status\n\nReady.\n\n## Install For Evaluation\n\nRun the documented setup.\n\n## Known Limitations\n\n- Provider coverage varies.\n\n## Verification Status\n\n- [x] Checks passed.\n`,
  );
}

function runReleaseCheck(args, root) {
  return spawnSync(
    process.execPath,
    [
      fileURLToPath(releaseScript),
      "--root",
      root instanceof URL ? fileURLToPath(root) : root.toString(),
      ...args,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
}

test("draft mode accepts the explicitly unreleased v0.1.0 draft notes", () => {
  const result = runReleaseCheck(["v0.1.0", "--draft"], repositoryRoot);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /draft release notes found/);
  assert.match(result.stdout, /no published release claimed/i);
});

test("publish mode accepts matching changelog, notes file, title, and required sections", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "quickvoice-release-metadata-"));

  try {
    await writeFixture(fixture);

    const result = runReleaseCheck(["v0.1.0"], fixture);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    for (const section of requiredSections) {
      assert.match(result.stdout, new RegExp(section));
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("publish mode fails when the changelog heading disagrees with the candidate", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "quickvoice-release-metadata-"));

  try {
    await writeFixture(fixture, { changelogVersion: "v0.2.0" });

    const result = runReleaseCheck(["v0.1.0"], fixture);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CHANGELOG.md/);
    assert.match(result.stderr, /v0.1.0/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("publish mode fails when release notes omit required readiness sections", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "quickvoice-release-metadata-"));

  try {
    await writeFixture(fixture);
    await writeFile(
      join(fixture, "docs", "releases", "v0.1.0.md"),
      "# QuickVoice v0.1.0\n\n## Status\n\nReady.\n",
    );

    const result = runReleaseCheck(["v0.1.0"], fixture);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Known Limitations/);
    assert.match(result.stderr, /Verification Status/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("release checklist documents the metadata check command", async () => {
  const checklist = await readFile(
    new URL("../docs/releases/release-checklist.md", import.meta.url),
    "utf8",
  );
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.match(checklist, /pnpm release:check -- v0\.1\.0 --draft/);
  assert.equal(
    manifest.scripts["release:check"],
    "node scripts/check-release-metadata.mjs",
  );
});
