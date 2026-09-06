import { EvidenceStatusNotice } from "@/components/evidence-status-notice";
import {
  getAllSlugs,
  getCaseStudyBySlug,
  getRelatedCaseStudies,
} from "@/lib/case-studies";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTACT_URL, DEMO_BOOKING_URL } from "@/lib/links";

interface Props {
  params: Promise<{ slug: string }>;
}

const evaluationAreas = [
  {
    index: "01",
    title: "Audience and consent",
    description:
      "Define who may be contacted, for which purpose, during which hours, with which opt-out and recording-disclosure process.",
  },
  {
    index: "02",
    title: "Minimum data boundary",
    description:
      "List the fields the workflow actually needs, where they come from, who can access them, and what must never enter a prompt or transcript.",
  },
  {
    index: "03",
    title: "Conversation path",
    description:
      "Map the opening, identity checks, user intent, allowed actions, confirmation language, failure states, and closing.",
  },
  {
    index: "04",
    title: "Human escalation",
    description:
      "Set the exact conditions for a handoff, the context a person receives, and what the agent must do when nobody is available.",
  },
  {
    index: "05",
    title: "Evaluation plan",
    description:
      "Choose observable success, safety, quality, and failure measures before setting a baseline or making an outcome claim.",
  },
] as const;

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const scenario = getCaseStudyBySlug(slug);

  if (!scenario) return { title: "Workflow scenario not found" };

  return {
    title: `${scenario.useCase} workflow scenario`,
    description: `An illustrative ${scenario.industry.toLowerCase()} AI phone-agent planning worksheet. It does not report customer results or establish an implemented integration.`,
    alternates: {
      canonical: `https://quickvoice.co/case-studies/${scenario.slug}`,
    },
    robots: {
      index: false,
      follow: true,
    },
    openGraph: {
      title: `${scenario.industry}: ${scenario.useCase} workflow scenario`,
      description:
        "Illustrative planning content, not a verified customer case study or performance claim.",
      type: "website",
      url: `https://quickvoice.co/case-studies/${scenario.slug}`,
      siteName: "QuickVoice",
    },
    twitter: {
      card: "summary_large_image",
      title: `${scenario.useCase} workflow scenario`,
      description:
        "Illustrative planning content, not a verified customer case study or performance claim.",
    },
  };
}

export default async function WorkflowScenarioPage({ params }: Props) {
  const { slug } = await params;
  const scenario = getCaseStudyBySlug(slug);
  if (!scenario) notFound();
  const related = getRelatedCaseStudies(slug, 3);

  return (
    <div className="bg-background text-foreground">
      <section className="page-section border-b border-border">
        <div className="site-container">
          <nav aria-label="Breadcrumb">
            <Link
              href="/case-studies"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-4"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Workflow
              scenarios
            </Link>
          </nav>
          <p className="eyebrow mt-8">
            {scenario.industry} · Illustrative scenario
          </p>
          <h1 className="page-title mt-4 max-w-4xl">{scenario.useCase}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            A planning scenario for exploring call flow, data access, human
            handoffs, safeguards, and evaluation criteria in{" "}
            {scenario.industry.toLowerCase()}.
          </p>
          <div className="mt-8 max-w-3xl">
            <EvidenceStatusNotice title="Do not cite this page as customer evidence">
              <p>
                This route is an illustrative planning aid, not a customer case
                study. It does not present organization profiles, quotes,
                timelines, prices, or outcome figures as QuickVoice evidence.
                Validate every workflow assumption before using it in a
                proposal, launch, directory listing, or buying decision.
              </p>
            </EvidenceStatusNotice>
          </div>
          {scenario.tags.length > 0 && (
            <ul
              aria-label="Scenario topics"
              className="mt-6 flex flex-wrap gap-2"
            >
              {scenario.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-md border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
                >
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="page-section">
        <div className="site-container grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="eyebrow">Evaluation worksheet</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Turn the scenario into a testable workflow.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Use these review areas to write requirements for a synthetic-data
              prototype. Do not infer an integration, deployment result, or
              production readiness from this scenario.
            </p>
            <Link
              href="/resources"
              className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-4"
            >
              Get implementation planning resources{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <ol className="space-y-4">
            {evaluationAreas.map((area) => (
              <li key={area.index} className="surface-card flex gap-5 p-6">
                <span
                  aria-hidden="true"
                  className="text-sm font-semibold text-primary"
                >
                  {area.index}
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{area.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {area.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="page-section border-y border-border bg-muted/25">
        <div className="site-container">
          <h2 className="text-3xl font-semibold tracking-tight">
            Review the requirements for your own workflow.
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            Discuss the call flow with the team, or{" "}
            <Link
              href="/open-source"
              className="text-primary underline underline-offset-4"
            >
              inspect the source and provider requirements
            </Link>{" "}
            before planning a prototype.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a
                href={DEMO_BOOKING_URL}
                data-analytics-location="scenario_footer"
              >
                Book a demo <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link
                href={CONTACT_URL}
                data-analytics-location="scenario_footer"
              >
                Contact the team
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="page-section">
          <div className="site-container">
            <h2 className="text-2xl font-semibold tracking-tight">
              Related planning scenarios
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {related.map((item) => (
                <Link
                  key={item.slug}
                  href={`/case-studies/${item.slug}`}
                  className="surface-card p-6 transition-colors hover:border-primary"
                >
                  <span className="text-xs font-medium uppercase tracking-wider text-primary">
                    {item.industry}
                  </span>
                  <span className="mt-3 block font-semibold">
                    {item.useCase}
                  </span>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
                    Review scenario{" "}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
