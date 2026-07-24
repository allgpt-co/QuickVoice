import { EvidenceStatusNotice } from "@/components/evidence-status-notice";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  ClipboardList,
  PhoneIncoming,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Open-Source AI Phone-Agent Infrastructure for Healthcare",
  description:
    "Evaluate self-hostable AI phone-agent workflows for healthcare scheduling, reminders, routing, and follow-up with explicit provider and compliance boundaries.",
  alternates: { canonical: "https://quickvoice.co/industries/healthcare" },
  openGraph: {
    title: "QuickVoice for Healthcare Workflows",
    description:
      "Inspect and adapt open-source phone-agent infrastructure for healthcare workflows. Compliance depends on deployment, controls, contracts, providers, and operations.",
    url: "https://quickvoice.co/industries/healthcare",
    siteName: "QuickVoice",
    type: "website",
  },
};

const workflows = [
  {
    icon: PhoneIncoming,
    title: "Call intake and routing",
    description:
      "Collect the caller’s stated need, apply an approved routing policy, and transfer or escalate when the agent should not continue.",
  },
  {
    icon: CalendarClock,
    title: "Scheduling workflows",
    description:
      "Connect an approved scheduling source, constrain which appointment actions are allowed, and preserve a human handoff for exceptions.",
  },
  {
    icon: BellRing,
    title: "Reminders and follow-up",
    description:
      "Run consent-aware reminder flows with identity checks, minimal disclosure, opt-out handling, and documented escalation paths.",
  },
  {
    icon: ClipboardList,
    title: "Structured call outcomes",
    description:
      "Capture only the operational fields a workflow needs, then review where transcripts, recordings, summaries, and exports are stored.",
  },
];

const evaluationQuestions = [
  "Which data is necessary for this call, and which data must never enter a prompt, transcript, recording, or log?",
  "How is caller identity checked before sensitive information or actions are allowed?",
  "Which telephony, speech, model, storage, analytics, and integration providers receive data?",
  "What happens when the agent is uncertain, a caller withdraws consent, or a provider becomes unavailable?",
  "Who can view, export, correct, retain, and delete call data in the deployed environment?",
  "Which contracts, notices, risk assessments, policies, and approvals are required before production use?",
];

export default function HealthcarePage() {
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Open-Source AI Phone-Agent Infrastructure for Healthcare",
    description:
      "A factual overview of healthcare workflow patterns and deployment review boundaries for QuickVoice.",
    url: "https://quickvoice.co/industries/healthcare",
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
      />

      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background px-6 pb-16 pt-32 sm:pb-20">
        <div className="mx-auto max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-primary">
            <Stethoscope className="h-4 w-4" aria-hidden="true" />
            Healthcare workflow infrastructure
          </div>
          <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Build healthcare phone workflows on a stack you can inspect
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            QuickVoice exposes the console, API, agent worker, call data paths,
            and provider boundaries so a healthcare team can evaluate and adapt
            them before considering production use.
          </p>

          <div className="mt-10">
            <EvidenceStatusNotice title="Healthcare use requires a full deployment review">
              <p>
                QuickVoice does not claim that a fresh clone, repository, or
                generic deployment is HIPAA compliant. Do not process protected
                health information until your security, privacy, legal, and
                operational owners approve the exact deployment and all required
                provider agreements are in place.
              </p>
            </EvidenceStatusNotice>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/open-source"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Inspect the repository
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/compliance/hipaa"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-6 py-3 font-medium transition hover:bg-muted"
            >
              Healthcare deployment checklist
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Workflow patterns
          </p>
          <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Start with bounded, reviewable call flows
          </h2>
          <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
            These are implementation patterns, not claims of native EHR
            integrations, clinical decision support, automatic compliance, or
            guaranteed outcomes.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {workflows.map((workflow) => (
              <article
                key={workflow.title}
                className="rounded-xl border border-border bg-card p-6"
              >
                <workflow.icon
                  className="h-6 w-6 text-primary"
                  aria-hidden="true"
                />
                <h3 className="mt-5 text-xl font-semibold">{workflow.title}</h3>
                <p className="mt-3 leading-7 text-muted-foreground">
                  {workflow.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/30 px-6 py-16 sm:py-24">
        <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
            <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Questions to answer before implementation
            </h2>
            <p className="mt-5 leading-7 text-muted-foreground">
              Turn each answer into a testable requirement, named owner, and
              review artifact.
            </p>
          </div>

          <ol className="space-y-4">
            {evaluationQuestions.map((question, index) => (
              <li
                key={question}
                className="grid grid-cols-[36px_1fr] gap-4 rounded-xl border border-border bg-background p-5"
              >
                <span className="font-mono text-sm text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="leading-7">{question}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 rounded-2xl border border-primary/25 bg-primary/5 p-8 sm:flex-row sm:items-center sm:p-10">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
              Source before claims
            </p>
            <h2 className="mt-3 text-2xl font-semibold">
              Review the code-backed boundaries with your team
            </h2>
            <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
              Start locally, document gaps, and treat every production
              integration and compliance requirement as an explicit engineering
              and governance decision.
            </p>
          </div>
          <Link
            href="/company/contact"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Discuss requirements
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
