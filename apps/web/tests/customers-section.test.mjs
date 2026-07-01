import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(
  join(root, "src/components/landing/Customers/page.tsx"),
  "utf8",
);

test("customers section renders separated circular infinite upper and lower rows", () => {
  assert.match(source, /Our Customers/);
  assert.match(source, /upperRowCustomers/);
  assert.match(source, /lowerRowCustomers/);
  assert.match(source, /function UpperCustomerRow/);
  assert.match(source, /function LowerCustomerRow/);
  assert.match(source, /customer-circular-left/);
  assert.match(source, /customer-circular-right/);
  assert.match(source, /translateX\(-25%\)/);
  assert.match(source, /rounded-full/);
  assert.match(source, /aria-hidden="true"/);
  assert.doesNotMatch(source, /animate-scroll-left/);
  assert.doesNotMatch(source, /animate-scroll-right/);
});

test("customers marquee repeats one continuous track with slower timing", () => {
  assert.match(source, /const MARQUEE_REPEAT_COUNT = 4/);
  assert.match(source, /flatMap/);
  assert.match(source, /animation-duration: 140s/);
  assert.match(source, /gap-5/);
  assert.doesNotMatch(source, /pr-5/);
});
