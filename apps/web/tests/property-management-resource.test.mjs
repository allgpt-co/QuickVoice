import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BENCHMARK_COLUMNS,
  BENCHMARK_OUTCOME_COLUMNS,
  PILOT_EVIDENCE_COLUMNS,
  PROPERTY_BENCHMARK_CATEGORIES,
  PROPERTY_RESOURCE_DOWNLOADS,
  PROPERTY_RESOURCE_PATH,
  propertyBenchmarkCsv,
  propertyPilotEvidenceCsv,
} from "../data/property-management-resource.mjs";

const downloads = new URL("../public/resources/", import.meta.url);
const read = (file) => readFileSync(new URL(file, downloads), "utf8");

// These authored CSVs contain quoted, single-line fields; reject drift from that contract.
function parseCsv(text) {
  return text.trimEnd().split(/\r?\n/).map((line) => {
    const fields = line.match(/"(?:[^"]|"")*"(?=,|$)/g);
    assert.ok(fields, "Every CSV field must be quoted");
    assert.equal(fields.join(","), line);
    return fields.map((field) => field.slice(1, -1).replaceAll('""', '"'));
  });
}

test("benchmark has 10 categories with 3 distinct authored cases each", () => {
  assert.equal(PROPERTY_BENCHMARK_CATEGORIES.length, 10);
  const cases = PROPERTY_BENCHMARK_CATEGORIES.flatMap((category) => {
    assert.ok(category.id && category.title);
    assert.equal(category.cases.length, 3);
    return category.cases;
  });
  assert.equal(cases.length, 30);
  assert.equal(new Set(cases.map((item) => item.id)).size, 30);
  assert.equal(new Set(cases.map((item) => item.scenario)).size, 30);
  for (const item of cases) {
    assert.match(item.id, /^LEASE-\d{2}$/);
    assert.ok(item.scenario.length > 30 && item.expected.length > 30);
    assert.ok(["standard", "critical"].includes(item.severity));
  }
});

test("downloaded scorecard matches visible scenario source and has no recorded outcomes", () => {
  const source = read("property-management-benchmark-scorecard.csv");
  assert.equal(source, propertyBenchmarkCsv());
  const [header, ...rows] = parseCsv(source);
  assert.deepEqual(header, BENCHMARK_COLUMNS);
  assert.equal(rows.length, 30);
  for (const row of rows) {
    assert.equal(row.length, header.length);
    assert.equal(row[2], "Fictional; unexecuted");
    for (const column of BENCHMARK_OUTCOME_COLUMNS) {
      assert.equal(row[header.indexOf(column)], "", `${column} must be blank`);
    }
    assert.ok(row.every((cell) => !/^[=+@-]/.test(cell)), "No spreadsheet formulas in authored templates");
  }
});

test("pilot evidence log contains only its header and a completely empty record", () => {
  const source = read("property-management-pilot-evidence-log.csv");
  assert.equal(source, propertyPilotEvidenceCsv());
  const [header, ...rows] = parseCsv(source);
  assert.deepEqual(header, PILOT_EVIDENCE_COLUMNS);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, header.length);
  assert.ok(rows[0].every((field) => field === ""));
});

test("all linked resources are nonempty UTF-8 downloads with honest Markdown source", () => {
  assert.equal(PROPERTY_RESOURCE_DOWNLOADS.length, 4);
  for (const resource of PROPERTY_RESOURCE_DOWNLOADS) {
    assert.match(resource.file, /^property-management-[a-z-]+\.(md|csv)$/);
    const bytes = readFileSync(new URL(resource.file, downloads));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    assert.ok(text.length > 150);
    if (resource.file.endsWith(".md")) {
      assert.match(text, /^# /);
      assert.match(text, /unexecuted/i);
      assert.match(text, /not a .*result|not .*customer result/i);
    }
  }
  assert.doesNotMatch(read("property-management-pilot-checklist.md"), /- \[[xX]\]/);
});

test("resource route reuses its downloadable script, checklist and existing buyer tools", () => {
  assert.equal(PROPERTY_RESOURCE_PATH, "/resources/property-management-call-intake");
  const page = readFileSync(new URL("../src/app/resources/property-management-call-intake/page.tsx", import.meta.url), "utf8");
  for (const filename of ["property-management-leasing-script.md", "property-management-pilot-checklist.md"]) {
    assert.ok(page.includes(`file="${filename}"`));
  }
  for (const href of ["/company/contact", "/industries/real-estate", "/resources#costs", "/resources#checklist"]) {
    assert.ok(page.includes(`href="${href}"`));
  }
  assert.ok(page.includes("Discuss a leasing-intake pilot"));
  assert.ok(page.includes("PROPERTY_BENCHMARK_CATEGORIES.map"));
  assert.doesNotMatch(page, /<iframe|<audio|<video|<form/);
});
