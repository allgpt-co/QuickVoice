import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const PNPM = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const WINDOWS_SHELL = process.platform === "win32";

test("docs OpenAPI contract stays internally consistent", () => {
  const result = spawnSync(PNPM, ["--filter", "docs", "validate:openapi"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: WINDOWS_SHELL,
  });

  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  assert.match(result.stdout, /OpenAPI contract validation passed/);
});
