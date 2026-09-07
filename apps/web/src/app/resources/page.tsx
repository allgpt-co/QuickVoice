import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ArrowDownToLine, ArrowRight, ClipboardCheck, Calculator } from "lucide-react";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import { CONTACT_URL, DEMO_BOOKING_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "AI phone-agent buyer resources",
  description:
    "Define a phone workflow, test its handoffs, and estimate its costs with an implementation checklist and editable cost worksheet.",
  alternates: { canonical: "https://quickvoice.co/resources" },
  openGraph: {
    title: "AI phone-agent buyer resources",
    description:
      "Practical worksheets for evaluating one phone-agent workflow.",
    url: "https://quickvoice.co/resources",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI phone-agent buyer resources",
    description:
      "Practical worksheets for evaluating one phone-agent workflow.",
    images: ["/og-image.png"],
  },
};

function ResourceText({ file, idPrefix }: { file: string; idPrefix: string }) {
  const content = readFileSync(join(process.cwd(), "public/resources", file), "utf8");
  const title = content.match(/^# (.+)\r?\n/)?.[1] ?? "";
  return <MarkdownRenderer content={content} title={title} idPrefix={idPrefix} resourceLinks />;
}

export default function ResourcesPage() {
  return (
    <div className="bg-background text-foreground">
      <section className="page-section border-b border-border">
        <div className="site-container">
          <p className="eyebrow">Buyer resources</p>
          <h1 className="page-title mt-4 max-w-3xl">Useful tools for your first phone-agent pilot.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Define one workflow, test its handoffs, and estimate its full operating cost with your business owner and technical evaluator.</p>
          <p className="mt-4 text-sm text-muted-foreground">Open downloads. No signup required.</p>

          <div className="mt-9 grid gap-5 md:grid-cols-2">
            <article className="surface-card flex flex-col p-6 sm:p-8">
              <ClipboardCheck className="size-6 text-primary" aria-hidden="true" />
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">Implementation checklist</h2>
              <p className="mt-3 flex-1 leading-7 text-muted-foreground">Agree on the call type, allowed actions, human fallback, and evidence you need before expanding.</p>
              <a href="/resources/phone-agent-checklist.pdf" download className="mt-6 inline-flex items-center justify-center gap-2 self-start rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground"><ArrowDownToLine className="size-4" aria-hidden="true" />Download checklist (PDF)</a>
              <a href="#checklist" className="mt-4 text-sm font-semibold text-primary underline underline-offset-4">Read the checklist on this page</a>
            </article>
            <article className="surface-card flex flex-col p-6 sm:p-8">
              <Calculator className="size-6 text-primary" aria-hidden="true" />
              <h2 className="mt-5 text-2xl font-semibold tracking-tight">Cost worksheet</h2>
              <p className="mt-3 flex-1 leading-7 text-muted-foreground">Include providers, unsuccessful attempts, implementation, and human follow-up. Replace the illustrative inputs with your own quotes and observations.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="/resources/cost-estimation.csv" download className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground"><ArrowDownToLine className="size-4" aria-hidden="true" />Download worksheet (CSV)</a>
                <a href="/resources/cost-estimation-guide.pdf" download className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-3 font-semibold"><ArrowDownToLine className="size-4" aria-hidden="true" />Instructions (PDF)</a>
              </div>
              <a href="#costs" className="mt-4 text-sm font-semibold text-primary underline underline-offset-4">Read the worksheet instructions</a>
            </article>
          </div>
        </div>
      </section>

      <div className="site-container py-12 sm:py-16">
        <section id="checklist" className="scroll-mt-28 border-b border-border pb-10" aria-labelledby="checklist-heading">
          <h2 id="checklist-heading" className="text-2xl font-semibold tracking-tight">Use the checklist to define a decision.</h2>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">Start with one call type, a defined outcome, and a named human fallback. Record what the pilot must demonstrate and which requests it should leave with your team.</p>
          <details className="mt-6 border-border sm:rounded-xl sm:border sm:p-6">
            <summary className="cursor-pointer font-semibold">Read the full implementation checklist</summary>
            <div className="mt-6"><ResourceText file="buyer-implementation-checklist.md" idPrefix="checklist" /></div>
          </details>
        </section>
        <section id="costs" className="scroll-mt-28 py-10" aria-labelledby="costs-heading">
          <h2 id="costs-heading" className="text-2xl font-semibold tracking-tight">Make the worksheet your own.</h2>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">The CSV contains spreadsheet formulas. Its sample values are illustrative, and zero supplier rates mean unknown, not free. Read the instructions, replace the inputs, and keep the validation flags unconfirmed until you have supporting evidence.</p>
          <details className="mt-6 border-border sm:rounded-xl sm:border sm:p-6">
            <summary className="cursor-pointer font-semibold">Read the full cost worksheet instructions</summary>
            <div className="mt-6"><ResourceText file="cost-estimation-guide.md" idPrefix="costs" /></div>
          </details>
        </section>
        <section className="mt-4 rounded-xl border border-border bg-muted/30 p-6 sm:p-8">
          <p className="eyebrow">Keep exploring</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">Match the tools to your workflow.</h2>
          <div className="mt-6 flex flex-wrap gap-x-7 gap-y-4">
            <Link href="/use-cases/appointment-scheduling" className="inline-flex items-center gap-2 font-semibold text-primary">Appointment requests <ArrowRight aria-hidden="true" className="size-4" /></Link>
            <Link href="/use-cases/customer-support" className="inline-flex items-center gap-2 font-semibold text-primary">Customer support <ArrowRight aria-hidden="true" className="size-4" /></Link>
            <Link href="/open-source" className="inline-flex items-center gap-2 font-semibold text-primary">Technical evaluation <ArrowRight aria-hidden="true" className="size-4" /></Link>
          </div>
        </section>
      </div>

      <section className="border-t border-border bg-muted/40 py-12 sm:py-16">
        <div className="site-container flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div><h2 className="text-2xl font-semibold tracking-tight">Work through one workflow with us.</h2><p className="mt-3 max-w-xl leading-7 text-muted-foreground">Bring your call type, approximate volume, destination systems, and the decision you need to make. Keep caller records and sensitive information out of the initial enquiry.</p></div>
          <div className="flex flex-wrap gap-3">
            <Link href={DEMO_BOOKING_URL} data-analytics-location="resources" className="inline-flex items-center rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground">Book a demo</Link>
            <Link href={CONTACT_URL} data-analytics-location="resources" className="inline-flex items-center rounded-lg border border-border px-5 py-3 font-semibold">Contact the team</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
