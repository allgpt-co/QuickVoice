import { EvidenceStatusNotice } from "@/components/evidence-status-notice";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  BellRing,
  ClipboardCheck,
  Landmark,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Open-Source AI Phone-Agent Infrastructure for Financial Services",
  description:
    "Evaluate self-hostable phone-agent workflows for financial-services support, reminders, routing, and follow-up with explicit security and regulatory boundaries.",
  alternates: {
    canonical: "https://quickvoice.co/industries/financial-services",
  },
  openGraph: {
    title: "QuickVoice for Financial-Services Workflows",
    description:
      "Inspect and adapt open-source phone-agent infrastructure for financial-services workflows. Compliance depends on the complete deployment and operating controls.",
    url: "https://quickvoice.co/industries/financial-services",
    siteName: "QuickVoice",
    type: "website",
  },
};

const workflows = [
  {
    icon: PhoneCall,
    title: "Tier-one inquiry routing",
    description:
      "Identify the caller’s stated need, apply an approved routing policy, and transfer requests that require authenticated systems or licensed human judgment.",
  },
  {
    icon: BellRing,
    title: "Consent-aware reminders",
    description:
      "Model payment, renewal, or document reminders with identity checks, minimal disclosure, opt-out handling, quiet hours, and escalation paths.",
  },
  {
    icon: ClipboardCheck,
    title: "Structured follow-up",
    description:
      "Capture only approved operational outcomes, write to allowlisted systems, and keep high-impact actions behind explicit authorization.",
  },
  {
    icon: BadgeDollarSign,
    title: "Collections workflow prototyping",
    description:
      "Test scripts, disclosures, consent, transfer rules, and jurisdiction-specific requirements without claiming that a generic workflow is legally compliant.",
  },
];

const gates = [
  "Identify every jurisdiction, product, communication type, and regulated data element in scope.",
  "Require appropriate caller authentication before disclosing account information or allowing account actions.",
  "Map telephony, speech, model, storage, analytics, and integration providers that can receive data.",
  "Prevent raw payment-card or other prohibited data from entering prompts, recordings, transcripts, or logs.",
  "Test consent, DNC/TCPA, FDCPA, recording, disclosure, accessibility, and escalation requirements with qualified counsel.",
  "Document retention, deletion, incident response, access review, audit evidence, and human oversight.",
];

export default function FinancialServicesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background px-6 pb-16 pt-32 sm:pb-20">
        <div className="mx-auto max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-primary">
            <Landmark className="h-4 w-4" aria-hidden="true" />
            Financial-services workflow infrastructure
          </div>
          <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Prototype regulated call flows on inspectable infrastructure
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            QuickVoice exposes the application, API, agent runtime, call data
            paths, and provider boundaries so teams can review them before
            connecting sensitive financial workflows.
          </p>

          <div className="mt-10">
            <EvidenceStatusNotice title="No automatic compliance or certification">
              <p>
                QuickVoice does not claim that a fresh clone or generic
                deployment is PCI DSS, SOC 2, ISO 27001, TCPA, FDCPA, or
                otherwise compliant. Production use requires review of the exact
                workflow, deployment, providers, contracts, controls,
                jurisdictions, and operating procedures.
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
              href="/company/contact"
              className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 font-medium transition hover:bg-muted"
            >
              Discuss a deployment review
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Bounded workflow patterns
          </p>
          <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Separate automation from regulated decisions
          </h2>
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
              Minimum review gates
            </h2>
            <p className="mt-5 leading-7 text-muted-foreground">
              Convert each gate into named ownership, test evidence, and
              approval criteria for the exact deployment.
            </p>
          </div>
          <ol className="space-y-4">
            {gates.map((gate, index) => (
              <li
                key={gate}
                className="grid grid-cols-[36px_1fr] gap-4 rounded-xl border border-border bg-background p-5"
              >
                <span className="font-mono text-sm text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="leading-7">{gate}</p>
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
              Review the code, dependencies, and data paths
            </h2>
            <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
              Start locally, document gaps, and keep every external system and
              regulated action behind explicit engineering and governance
              decisions.
            </p>
          </div>
          <Link
            href="https://github.com/allgpt-co/QuickVoice"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            View source on GitHub
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
