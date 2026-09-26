import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ArrowDownToLine, ArrowLeft, ArrowRight } from "lucide-react";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import { EvidenceStatusNotice } from "@/components/evidence-status-notice";
import {
  PROPERTY_BENCHMARK_CATEGORIES,
  PROPERTY_RESOURCE_DOWNLOADS,
  PROPERTY_RESOURCE_PATH,
  PROPERTY_RESOURCE_STATUS,
} from "@/data/property-management-resource.mjs";

const title = "Property Management Call Intake: Script and Pilot Checklist";
const description = "Plan a request-only leasing pilot with a fictional call script, checklist, 30 unexecuted synthetic test cases and an empty private evidence log. Free downloads.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `https://quickvoice.co${PROPERTY_RESOURCE_PATH}` },
  openGraph: {
    title,
    description,
    url: `https://quickvoice.co${PROPERTY_RESOURCE_PATH}`,
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
};

function ResourceText({ file, idPrefix }: { file: string; idPrefix: string }) {
  const content = readFileSync(join(process.cwd(), "public/resources", file), "utf8");
  const resourceTitle = content.match(/^# (.+)\r?\n/)?.[1] ?? "";
  return <MarkdownRenderer content={content} title={resourceTitle} idPrefix={idPrefix} resourceLinks />;
}

const sectionLink = "inline-flex min-h-11 items-center rounded-md px-1 font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

export default function PropertyManagementResourcePage() {
  return (
    <div className="bg-background text-foreground">
      <section className="page-section border-b border-border">
        <div className="site-container">
          <Link href="/resources" className={sectionLink}>
            <ArrowLeft className="mr-2 size-4" aria-hidden="true" /> All buyer resources
          </Link>
          <p className="eyebrow mt-6">Property-management evaluation kit</p>
          <h1 className="page-title mt-4 max-w-4xl">Plan a leasing enquiry. Verify the handoff.</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
            A request-only call script, pilot checklist and 30 synthetic test cases for a property-management team evaluating after-hours leasing intake. Read everything here or download editable files. No signup required.
          </p>
          <div className="mt-7 max-w-3xl">
            <EvidenceStatusNotice title="Evaluation materials, not customer evidence">
              <p>{PROPERTY_RESOURCE_STATUS} There are no recorded calls, measured outcomes or verified customer deployments behind these examples. An enquiry is not a confirmed viewing, a lease or a maintenance work order.</p>
            </EvidenceStatusNotice>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/company/contact" data-analytics-location="property_resource" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Discuss a leasing-intake pilot</Link>
            <Link href="/industries/real-estate" className={sectionLink}>Explore the property workflow <ArrowRight className="ml-2 size-4" aria-hidden="true" /></Link>
          </div>
          <nav aria-label="On this page" className="mt-9 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-5">
            <a href="#downloads" className={sectionLink}>Downloads</a>
            <a href="#leasing-script" className={sectionLink}>Leasing script</a>
            <a href="#pilot-checklist" className={sectionLink}>Pilot checklist</a>
            <a href="#synthetic-benchmark" className={sectionLink}>30 test cases</a>
            <a href="#evidence-log" className={sectionLink}>Evidence log</a>
          </nav>
        </div>
      </section>

      <div className="site-container py-12 sm:py-16">
        <section id="downloads" aria-labelledby="downloads-heading" className="scroll-mt-28">
          <h2 id="downloads-heading" className="text-2xl font-semibold tracking-tight">Editable files. Empty result fields.</h2>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">All four downloads are UTF-8 text. Markdown opens in a text editor; CSV opens in a spreadsheet. Keep your completed versions private. The original files contain no caller records or measured results.</p>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            {PROPERTY_RESOURCE_DOWNLOADS.map((resource) => (
              <article key={resource.file} className="surface-card flex flex-col p-6">
                <h3 className="text-xl font-semibold tracking-tight">{resource.label}</h3>
                <p className="mt-3 flex-1 leading-7 text-muted-foreground">{resource.description}</p>
                <a href={`/resources/${resource.file}`} download data-analytics-location="property_resource" className="mt-5 inline-flex min-h-11 items-center gap-2 self-start rounded-lg border border-border px-4 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                  <ArrowDownToLine className="size-4 shrink-0" aria-hidden="true" /> Download {resource.label.toLowerCase()} ({resource.format})
                </a>
              </article>
            ))}
          </div>
        </section>

        <section id="leasing-script" aria-labelledby="script-heading" className="mt-12 scroll-mt-28 border-t border-border pt-10">
          <h2 id="script-heading" className="text-2xl font-semibold tracking-tight">A request-only leasing script</h2>
          <div className="mt-6 max-w-3xl"><ResourceText file="property-management-leasing-script.md" idPrefix="leasing-script-text" /></div>
        </section>

        <section id="pilot-checklist" aria-labelledby="checklist-heading" className="mt-12 scroll-mt-28 border-t border-border pt-10">
          <h2 id="checklist-heading" className="text-2xl font-semibold tracking-tight">Leasing-intake pilot checklist</h2>
          <div className="mt-6 max-w-3xl"><ResourceText file="property-management-pilot-checklist.md" idPrefix="leasing-checklist-text" /></div>
        </section>

        <section id="synthetic-benchmark" aria-labelledby="benchmark-heading" className="mt-12 scroll-mt-28 border-t border-border pt-10">
          <h2 id="benchmark-heading" className="text-2xl font-semibold tracking-tight">30 synthetic cases. None executed.</h2>
          <div className="mt-4 max-w-3xl space-y-4 leading-7 text-muted-foreground">
            <p>This is a benchmark specification, not a benchmark result. Each of the ten categories contains three fictional scenarios and proposed expected behavior. Use synthetic records and a controlled test configuration; do not make real emergency calls or send test requests to an unapproved destination.</p>
            <p>Leave outcome fields blank until a case is run. Then record <strong className="text-foreground">pass, fail or blocked</strong>, the actual behavior, execution date, version, reviewer and private evidence reference. Blocked and unrun cases are not passes. Report case counts by category, not a misleading overall reliability percentage.</p>
            <p><strong className="text-foreground">Critical means a stop condition:</strong> an unsafe disclosure, eligibility decision, false booking or dispatch claim, missing urgent fallback or unresolved critical delivery path. Any case can expose a critical failure. Stop expansion, correct the issue and rerun affected cases; a passing set still does not establish universal reliability or compliance.</p>
          </div>
          <div className="mt-7 space-y-3">
            {PROPERTY_BENCHMARK_CATEGORIES.map((category, index) => (
              <details key={category.id} className="rounded-xl border border-border px-5 sm:px-6">
                <summary className="cursor-pointer py-5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{index + 1}. {category.title} <span className="font-normal text-muted-foreground">— 3 unexecuted cases</span></summary>
                <ol className="divide-y divide-border pb-3">
                  {category.cases.map((item) => (
                    <li key={item.id} className="py-5">
                      <h3 className="font-semibold">{item.id} <span className="font-normal text-muted-foreground">· {item.severity === "critical" ? "Critical path" : "Standard path"}</span></h3>
                      <p className="mt-3 max-w-3xl leading-7">{item.scenario}</p>
                      <p className="mt-2 max-w-3xl leading-7 text-muted-foreground"><strong className="font-medium text-foreground">Expected behavior:</strong> {item.expected}</p>
                      <p className="mt-2 text-sm text-muted-foreground">Observed outcome: not recorded. This case has not been run.</p>
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        </section>

        <section id="evidence-log" aria-labelledby="evidence-heading" className="mt-12 scroll-mt-28 border-t border-border pt-10">
          <h2 id="evidence-heading" className="text-2xl font-semibold tracking-tight">Keep observations private. Make claims reproducible.</h2>
          <div className="mt-4 max-w-3xl space-y-4 leading-7 text-muted-foreground">
            <p>The pilot evidence CSV has a header and one completely empty row, not an example customer. Duplicate the blank row for each observed call. Store the completed log and supporting evidence in your approved, access-controlled system—not in this website, a public repository or an initial sales enquiry.</p>
            <p>Use a non-identifying local record key and private evidence reference. Do not paste caller names, phone numbers, addresses, recordings, transcripts, account identifiers, credentials or private-system URLs into public files. Avoid unnecessary free text; treat any imported spreadsheet values as untrusted text, not formulas.</p>
            <dl className="space-y-5">
              <div><dt className="font-semibold text-foreground">Context and eligibility</dt><dd className="mt-1">Record baseline or pilot, date, deployed version, call type, eligibility, reviewer and any exclusion reason. Use comparable periods and document staffing or scope changes. Do not combine synthetic runs with live pilot observations.</dd></div>
              <div><dt className="font-semibold text-foreground">Separate the outcome states</dt><dd className="mt-1">Record complete record, verified receipt, staff acknowledgement, completed follow-up, correction required and unresolved handoff independently. Use yes, no or unknown. A transcript does not establish staff acknowledgement; unknown does not count as success.</dd></div>
              <div><dt className="font-semibold text-foreground">Costs and staff effort</dt><dd className="mt-1">Record observed staff minutes and attributable provider cost in USD. Leave unmeasured values blank, not zero. Include setup and review effort in the existing cost worksheet; this log is not a competing calculator or quote.</dd></div>
              <div><dt className="font-semibold text-foreground">A useful first measure</dt><dd className="mt-1">Count eligible leasing calls whose records are complete, receipt-verified and staff-acknowledged. Divide by all eligible leasing calls, reporting the numerator, denominator, unknowns, corrections and unresolved handoffs. Do not infer confirmed viewings, leases or revenue.</dd></div>
            </dl>
            <p>Publish only approved, non-identifying aggregate findings with the measurement period, scope, exclusions and permission. A fictional scenario cannot become customer proof by adding a business name or an invented result.</p>
          </div>
        </section>

        <section className="mt-12 rounded-xl border border-border bg-muted/30 p-6 sm:p-8" aria-labelledby="related-heading">
          <h2 id="related-heading" className="text-2xl font-semibold tracking-tight">Use the tools already in your evaluation.</h2>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">This kit adds leasing-specific scope and tests. The existing buyer checklist covers broader implementation, and the existing cost worksheet accounts for provider costs, engineering and human follow-up.</p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/resources#checklist" className={sectionLink}>General implementation checklist</Link>
            <Link href="/resources#costs" className={sectionLink}>Existing cost worksheet</Link>
            <Link href="/blog/ai-voice-agents-property-management" className={sectionLink}>Property-management guide</Link>
            <Link href="/industries/real-estate" className={sectionLink}>Property-management workflow</Link>
          </div>
        </section>
      </div>

      <section className="border-t border-border bg-muted/40 py-12 sm:py-16">
        <div className="site-container flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div><h2 className="text-2xl font-semibold tracking-tight">Bring one leasing workflow and its owners.</h2><p className="mt-3 max-w-xl leading-7 text-muted-foreground">Share your portfolio scope, approximate call volume, property system and staff follow-up process. Keep caller records and sensitive information out of the enquiry.</p></div>
          <Link href="/company/contact" data-analytics-location="property_resource" className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Discuss a leasing-intake pilot</Link>
        </div>
      </section>
    </div>
  );
}
