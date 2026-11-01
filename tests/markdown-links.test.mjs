import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(
  new URL("../scripts/check-markdown-links.mjs", import.meta.url),
);

async function withFixture(run) {
  const root = await mkdtemp(join(tmpdir(), "quickvoice-md-links-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function runChecker(root) {
  return spawnSync(process.execPath, [checker, "--root", root], {
    encoding: "utf8",
  });
}

test("Markdown link checker accepts valid relative files and decoded headings", async () => {
  await withFixture(async (root) => {
    await writeFile(
      join(root, "README.md"),
      [
        "# Home",
        "",
        "See [setup](./docs/setup.md#quick-start).",
        "See [same file](#home).",
        "Ignore [external](https://example.com) and ![inline](data:image/png;base64,AAAA).",
      ].join("\n"),
    );
    await writeFile(join(root, "docs.md"), "# Standalone\n");
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs", "setup.md"), "# Quick Start\n");

    const result = runChecker(root);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Checked 3 Markdown files\./);
  });
});

test("Markdown link checker reports missing files with path and line", async () => {
  await withFixture(async (root) => {
    await writeFile(
      join(root, "README.md"),
      ["# Home", "", "See [missing](./docs/missing.md)."].join("\n"),
    );

    const result = runChecker(root);

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /README\.md:3 missing target \.\/docs\/missing\.md/,
    );
  });
});

test("Markdown link checker reports missing decoded heading fragments", async () => {
  await withFixture(async (root) => {
    await writeFile(
      join(root, "README.md"),
      ["# Home", "", "See [accent](./guide.md#caf%C3%A9-mode)."].join("\n"),
    );
    await writeFile(join(root, "guide.md"), "# Cafe Mode\n");

    const result = runChecker(root);

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /README\.md:3 missing heading \.\/guide\.md#caf%C3%A9-mode/,
    );
  });
});
