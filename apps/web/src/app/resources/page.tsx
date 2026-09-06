import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDownToLine,
  ArrowRight,
  ClipboardCheck,
  Calculator,
} from "lucide-react";

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

const readResource = (name: string) =>
  readFileSync(join(process.cwd(), "public/resources", name), "utf8").replace(
    /^# .+\n/,
    "",
  );

function ResourceText({ file }: { file: string }) {
  return (
    <div className="prose prose-slate mt-8 max-w-none dark:prose-invert prose-headings:scroll-mt-24 prose-a:text-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href?.startsWith("https://") ? href : `/resources/${href}`}
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {readResource(file)}
      </ReactMarkdown>
    </div>
  );
}

export default function ResourcesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-gradient-to-b from-primary/10 to-background px-4 pb-16 pt-32 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Buyer resources
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            A clearer decision before your first phone-agent pilot
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            Start with one call type, a defined outcome, and a named human
            fallback. Use these working documents with your business owner and
            technical evaluator to decide what to test and what it will cost.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Open downloads. No signup required. These are evaluation aids; the
            worksheet inputs are illustrative and must be replaced with your own
            evidence.
          </p>
        </div>
      </section>
      <div className="mx-auto max-w-5xl space-y-14 px-4 py-14 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          <a
            href="#checklist"
            className="rounded-2xl border border-border p-7 transition hover:border-primary"
          >
            <ClipboardCheck
              className="size-7 text-primary"
              aria-hidden="true"
            />
            <h2 className="mt-5 text-2xl font-semibold">
              Implementation checklist
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Define the job, check dependencies, plan caller handling, and test
              ten realistic outcomes.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 font-medium text-primary">
              Read and download{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          </a>
          <a
            href="#costs"
            className="rounded-2xl border border-border p-7 transition hover:border-primary"
          >
            <Calculator className="size-7 text-primary" aria-hidden="true" />
            <h2 className="mt-5 text-2xl font-semibold">Cost worksheet</h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              Include provider costs, human follow-up, quality review,
              infrastructure, and implementation.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 font-medium text-primary">
              Read and download{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          </a>
        </div>
        <section
          id="checklist"
          className="min-w-0 scroll-mt-24 rounded-2xl border border-border p-5 sm:p-8"
        >
          <h2 className="text-3xl font-semibold">
            AI phone-agent implementation checklist
          </h2>
          <a
            href="/resources/phone-agent-checklist.pdf"
            download
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-medium text-primary-foreground"
          >
            <ArrowDownToLine className="size-4" aria-hidden="true" />
            Download checklist (PDF)
          </a>
          <ResourceText file="buyer-implementation-checklist.md" />
        </section>
        <section
          id="costs"
          className="min-w-0 scroll-mt-24 rounded-2xl border border-border p-5 sm:p-8"
        >
          <h2 className="text-3xl font-semibold">
            Build a cost estimate with your own inputs
          </h2>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="/resources/cost-estimation.csv"
              download
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-medium text-primary-foreground"
            >
              <ArrowDownToLine className="size-4" aria-hidden="true" />
              Download worksheet (CSV)
            </a>
            <a
              href="/resources/cost-estimation-guide.pdf"
              download
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 font-medium"
            >
              <ArrowDownToLine className="size-4" aria-hidden="true" />
              Download instructions (PDF)
            </a>
          </div>
          <ResourceText file="cost-estimation-guide.md" />
        </section>
        <section className="rounded-2xl bg-primary/5 p-7 sm:p-9">
          <h2 className="text-2xl font-semibold">
            Work through one workflow with us
          </h2>
          <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
            Bring your call type, approximate volume, destination systems, and
            the decision you need to make. Keep caller records and sensitive
            information out of the initial enquiry.
          </p>
          <Link
            href="/company/contact"
            data-analytics-location="resources"
            className="mt-5 inline-flex items-center gap-2 font-medium text-primary"
          >
            Discuss your evaluation{" "}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </main>
  );
}
