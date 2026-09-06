import { EvidenceStatusNotice } from "@/components/evidence-status-notice";
import {
  getAllSlugs,
  getCaseStudyBySlug,
  getRelatedCaseStudies,
} from "@/lib/case-studies";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  FlaskConical,
  Tag,
} from "lucide-react";

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
    <main className="min-h-screen bg-background">
      <div className="border-b border-border bg-background/90 pt-20 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4">
          <Link
            href="/case-studies"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Workflow scenarios
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-primary">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              Illustrative scenario
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              {scenario.industry}
            </span>
          </div>

          <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            {scenario.useCase}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            A planning scenario for exploring call flow, data access, human
            handoffs, safeguards, and evaluation criteria in{" "}
            {scenario.industry.toLowerCase()}.
          </p>

          <div className="mt-8">
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
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Tag
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              {scenario.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <section className="mt-12 border-t border-border pt-10">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
            Evaluation worksheet
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-foreground">
            Turn the scenario into a testable workflow
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            Use these review areas to write requirements for a synthetic-data
            prototype. Do not infer an integration, deployment result, or
            production readiness from this scenario.
          </p>
          <div className="mt-8 grid border border-border sm:grid-cols-2">
            {evaluationAreas.map((area, index) => (
              <article
                key={area.index}
                className={`min-h-56 p-6 sm:p-8 ${
                  index > 0 ? "border-t border-border sm:border-t-0" : ""
                } ${index % 2 === 1 ? "sm:border-l sm:border-border" : ""} ${
                  index > 1 ? "sm:border-t sm:border-border" : ""
                }`}
              >
                <span className="font-mono text-sm font-semibold text-primary">
                  {area.index}
                </span>
                <h3 className="mt-10 text-lg font-semibold text-foreground">
                  {area.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {area.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-2xl border border-primary/25 bg-primary/5 p-8">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
            Build from evidence
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">
            Inspect the code-backed product surface
          </h2>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            Review what is implemented in the repository, what can run locally,
            and which external credentials are required for real calls.
          </p>
          <Link
            href="/open-source"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Explore the open-source stack
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>

        {related.length > 0 && (
          <section className="mt-16 border-t border-border pt-10">
            <h2 className="text-xl font-semibold text-foreground">
              Related planning scenarios
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {related.map((item) => (
                <Link
                  key={item.slug}
                  href={`/case-studies/${item.slug}`}
                  className="rounded-xl border border-border bg-card p-5 transition hover:border-primary/50"
                >
                  <span className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
                    {item.industry}
                  </span>
                  <span className="mt-3 block font-medium text-foreground">
                    {item.useCase}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
