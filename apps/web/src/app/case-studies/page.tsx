import { EvidenceStatusNotice } from "@/components/evidence-status-notice";
import { getAllCaseStudies, getAllIndustries } from "@/lib/case-studies";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, FlaskConical } from "lucide-react";

export const metadata: Metadata = {
  title: "AI Phone-Agent Workflow Scenarios",
  description:
    "Illustrative AI phone-agent workflow scenarios for evaluating automation opportunities. These are planning examples, not verified customer case studies.",
  alternates: { canonical: "https://quickvoice.co/case-studies" },
  openGraph: {
    title: "QuickVoice AI Phone-Agent Workflow Scenarios",
    description:
      "Explore illustrative workflow scenarios, then inspect the open-source implementation behind QuickVoice.",
    type: "website",
    url: "https://quickvoice.co/case-studies",
    siteName: "QuickVoice",
    images: [{ url: "https://quickvoice.co/og-image.png", width: 1200, height: 630 }],
  },
};

const INDUSTRY_PATHS: Record<string, string> = {
  Healthcare: "healthcare",
  Automotive: "automotive",
  "E-Commerce & Retail": "e-commerce",
  "Financial Services": "financial-services",
  "Real Estate": "real-estate",
  "Travel & Hospitality": "travel-hospitality",
  Manufacturing: "manufacturing-engineering",
  Education: "education",
  "HR & Recruiting": "hr-recruiting",
  "Logistics & Supply Chain": "logistics",
  SaaS: "saas",
};

export default function CaseStudiesIndexPage() {
  const allScenarios = getAllCaseStudies();
  const industries = getAllIndustries();

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background px-4 pb-16 pt-32">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-sm text-primary">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              Workflow planning library
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
              Explore what an AI phone agent could automate
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Use these scenarios to map call flows, data dependencies, human
              handoffs, and evaluation criteria before building an agent.
            </p>
          </div>

          <div className="mt-10">
            <EvidenceStatusNotice title="Illustrative content — not customer proof">
              <p>
                The scenarios in this library are planning examples.
                Organization profiles, quotes, timelines, costs, and outcome
                figures have not been validated as QuickVoice customer results
                and must not be cited as testimonials, benchmarks, or ROI
                evidence.
              </p>
            </EvidenceStatusNotice>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-16">
        {industries.map((industry) => {
          const scenarios = allScenarios.filter(
            (scenario) => scenario.industry === industry,
          );

          return (
            <section
              key={industry}
              className="mb-14"
              id={industry.toLowerCase().replace(/[\s&]+/g, "-")}
            >
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2 text-primary">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                    <span className="font-mono text-xs uppercase tracking-[0.18em]">
                      {scenarios.length} planning{" "}
                      {scenarios.length === 1 ? "scenario" : "scenarios"}
                    </span>
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-foreground">
                    {industry}
                  </h2>
                </div>
                {INDUSTRY_PATHS[industry] && (
                  <Link
                    href={`/industries/${INDUSTRY_PATHS[industry]}`}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    Industry overview
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {scenarios.map((scenario) => (
                  <Link
                    key={scenario.slug}
                    href={`/case-studies/${scenario.slug}`}
                    className="group flex min-h-48 flex-col rounded-xl border border-border bg-card p-6 transition hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
                  >
                    <span className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
                      Illustrative scenario
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                      {scenario.useCase}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      Review an example workflow, assumptions, handoffs, and
                      measurement plan for a team in {industry}.
                    </p>
                    <span className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-medium text-primary">
                      Review scenario
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        <section className="rounded-2xl border border-primary/25 bg-primary/5 p-8 sm:p-10">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Verify the implementation
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">
            Inspect what QuickVoice actually ships
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            The open-source page separates code-backed capabilities from
            provider credentials, deployment decisions, and unverified
            commercial claims.
          </p>
          <Link
            href="/open-source"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Explore the open-source stack
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </main>
  );
}
