import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const downloads = new URL("../public/resources/", import.meta.url);
const hash = (url) =>
  createHash("sha256").update(readFileSync(url)).digest("hex");

test("buyer downloads match their reviewed sources and generation manifest", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", downloads), "utf8"),
  );
  for (const [path, expected] of Object.entries({
    ...manifest.sources,
    ...manifest.generator,
  })) {
    assert.equal(
      hash(new URL(path, root)),
      expected,
      `Regenerate buyer resources after editing ${path}`,
    );
  }
  for (const [path, expected] of Object.entries(manifest.downloads)) {
    assert.equal(
      hash(new URL(path, downloads)),
      expected,
      `Download changed outside generator: ${path}`,
    );
    if (path.endsWith(".pdf"))
      assert.equal(
        readFileSync(new URL(path, downloads)).subarray(0, 5).toString(),
        "%PDF-",
      );
  }
  assert.deepEqual(
    readFileSync(new URL("cost-estimation.csv", downloads)),
    readFileSync(new URL("docs/marketing/seo/cost-estimation.csv", root)),
  );
});
