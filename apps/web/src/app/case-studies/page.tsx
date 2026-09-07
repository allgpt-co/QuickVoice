import { EvidenceStatusNotice } from "@/components/evidence-status-notice";
import { getAllCaseStudies, getAllIndustries } from "@/lib/case-studies";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTACT_URL, DEMO_BOOKING_URL } from "@/lib/links";

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
    images: [
      { url: "https://quickvoice.co/og-image.png", width: 1200, height: 630 },
    ],
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

const industryId = (industry: string) =>
  industry.toLowerCase().replace(/[\s&]+/g, "-");

export default function CaseStudiesIndexPage() {
  const allScenarios = getAllCaseStudies();
  const industries = getAllIndustries();

  return (
    <div className="bg-background text-foreground">
      <section className="page-section border-b border-border">
        <div className="site-container">
          <p className="eyebrow">Workflow planning library</p>
          <h1 className="page-title mt-4 max-w-4xl">
            Explore a call workflow before building it.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Use these scenarios to map call flows, data dependencies, human
            handoffs, and evaluation criteria before building an agent.
          </p>
          <div className="mt-8 max-w-3xl">
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
          <nav aria-label="Browse scenarios by industry" className="mt-8">
            <p className="mb-3 text-sm font-semibold">Jump to an industry</p>
            <ul className="flex flex-wrap gap-2">
              {industries.map((industry) => (
                <li key={industry}>
                  <a
                    href={`#${industryId(industry)}`}
                    className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
                  >
                    {industry}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      <div className="site-container page-section space-y-14">
        {industries.map((industry) => {
          const scenarios = allScenarios.filter(
            (scenario) => scenario.industry === industry,
          );
          return (
            <section
              key={industry}
              id={industryId(industry)}
              aria-labelledby={`${industryId(industry)}-title`}
            >
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="eyebrow">
                    {scenarios.length} planning scenarios
                  </p>
                  <h2
                    id={`${industryId(industry)}-title`}
                    className="mt-2 text-2xl font-semibold tracking-tight"
                  >
                    {industry}
                  </h2>
                </div>
                {INDUSTRY_PATHS[industry] && (
                  <Link
                    href={`/industries/${INDUSTRY_PATHS[industry]}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-4"
                  >
                    Industry guide{" "}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {scenarios.map((scenario) => (
                  <Link
                    key={scenario.slug}
                    href={`/case-studies/${scenario.slug}`}
                    className="surface-card group flex flex-col p-6 transition-colors hover:border-primary"
                  >
                    <span className="text-xs font-medium uppercase tracking-wider text-primary">
                      Illustrative scenario
                    </span>
                    <h3 className="mt-4 text-lg font-semibold">
                      {scenario.useCase}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      Review an example workflow, assumptions, handoffs, and
                      measurement plan for a team in {industry}.
                    </p>
                    <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-medium text-primary">
                      Review scenario{" "}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="page-section border-t border-border bg-muted/25">
        <div className="site-container">
          <p className="eyebrow">From a scenario to your requirements</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Talk through the workflow your team needs.
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            Bring your call flow, data requirements, and handoff questions to a
            demo. For technical details,{" "}
            <Link
              href="/open-source"
              className="text-primary underline underline-offset-4"
            >
              inspect the open-source stack
            </Link>
            .
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a
                href={DEMO_BOOKING_URL}
                data-analytics-location="scenarios_footer"
              >
                Book a demo <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link
                href={CONTACT_URL}
                data-analytics-location="scenarios_footer"
              >
                Contact the team
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
