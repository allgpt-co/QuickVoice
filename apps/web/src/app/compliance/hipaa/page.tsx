import { EvidenceStatusNotice } from "@/components/evidence-status-notice";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileSearch,
  KeyRound,
  Network,
  Scale,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Healthcare Data & HIPAA Deployment Considerations",
  description:
    "A practical review checklist for teams evaluating QuickVoice in healthcare. Compliance depends on deployment, contracts, controls, providers, operations, and legal review.",
  alternates: {
    canonical: "https://quickvoice.co/compliance/hipaa",
  },
  openGraph: {
    title: "QuickVoice Healthcare Deployment Review",
    description:
      "Inspect the code and evaluate the controls, provider agreements, retention choices, and operating processes required for a healthcare deployment.",
    type: "website",
    url: "https://quickvoice.co/compliance/hipaa",
    siteName: "QuickVoice",
  },
};

const reviewAreas = [
  {
    icon: KeyRound,
    title: "Identity and access",
    description:
      "Map every administrator, service account, API key, organization boundary, and support-access path. Verify least privilege and removal procedures in the deployment you operate.",
  },
  {
    icon: Database,
    title: "Call-data lifecycle",
    description:
      "Trace call metadata, transcripts, recordings, knowledge sources, logs, and exports from creation through backup, retention, deletion, and recovery.",
  },
  {
    icon: Network,
    title: "Provider chain",
    description:
      "Review LiveKit, telephony, speech, model, storage, email, and observability providers. Data handling and agreement requirements extend beyond this repository.",
  },
  {
    icon: ShieldCheck,
    title: "Runtime safeguards",
    description:
      "Test redaction, retention, secret handling, URL validation, tenant isolation, auditability, and failure behavior against your threat model and deployment configuration.",
  },
  {
    icon: FileSearch,
    title: "Operational evidence",
    description:
      "Document risk assessments, access reviews, incident response, workforce procedures, vendor reviews, change control, and the evidence needed for your own audit program.",
  },
  {
    icon: Scale,
    title: "Legal and contractual review",
    description:
      "Determine whether BAAs or other agreements are required with every relevant party. Have qualified privacy, security, and legal reviewers approve the production design.",
  },
];

const deploymentChecklist = [
  "Classify the data each call flow can collect, infer, store, or disclose.",
  "Document the exact QuickVoice commit, configuration, providers, regions, and subprocessors in scope.",
  "Obtain and review required provider agreements before processing regulated data.",
  "Configure authentication, authorization, network boundaries, encryption, logging, backups, and key rotation.",
  "Set retention and deletion rules for transcripts, recordings, logs, knowledge sources, exports, and backups.",
  "Test tenant isolation, redaction, deletion, restoration, incident response, and provider failure paths.",
  "Publish recording, consent, caller-identification, and escalation procedures appropriate to each jurisdiction.",
  "Complete security, privacy, legal, and operational approval before production use.",
];

const responsibilityRows = [
  {
    layer: "QuickVoice source",
    review:
      "Code paths, defaults, data models, permissions, logs, retention jobs, integrations, and update process.",
  },
  {
    layer: "Your deployment",
    review:
      "Cloud accounts, network controls, databases, object storage, secrets, backups, observability, availability, and access administration.",
  },
  {
    layer: "Voice and AI providers",
    review:
      "LiveKit, carrier, speech, model, embedding, vector, and other services that can receive or process call data.",
  },
  {
    layer: "Your organization",
    review:
      "Policies, workforce access, risk analysis, incident response, consent, notices, vendor management, contracts, and audit evidence.",
  },
];

export default function HealthcareDeploymentReviewPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background px-6 pb-16 pt-32 sm:pb-20">
        <div className="mx-auto max-w-5xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Healthcare deployment review
          </p>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
            HIPAA is a deployment outcome, not a repository badge
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            QuickVoice makes privacy-sensitive voice infrastructure inspectable.
            Your compliance posture still depends on how you deploy and operate
            it, which providers process data, which agreements are in place, and
            whether the full system passes security, privacy, operational, and
            legal review.
          </p>

          <div className="mt-10">
            <EvidenceStatusNotice title="No certification claim">
              <p>
                The open-source repository does not by itself establish HIPAA,
                SOC 2, ISO 27001, PCI DSS, GDPR, CCPA, or any other
                certification or compliance status. This page is an evaluation
                checklist, not an attestation, audit report, legal opinion, BAA,
                or guarantee.
              </p>
            </EvidenceStatusNotice>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/open-source"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Inspect the open-source stack
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
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Review the system, not a slogan
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Six areas every healthcare team should validate
            </h2>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reviewAreas.map((item) => (
              <article
                key={item.title}
                className="rounded-xl border border-border bg-card p-6"
              >
                <item.icon
                  className="h-6 w-6 text-primary"
                  aria-hidden="true"
                />
                <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/30 px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Shared responsibility
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Know which layer owns each control
          </h2>
          <div className="mt-10 overflow-hidden rounded-xl border border-border bg-background">
            {responsibilityRows.map((row, index) => (
              <div
                key={row.layer}
                className={`grid gap-2 p-6 sm:grid-cols-[180px_1fr] sm:gap-8 ${
                  index > 0 ? "border-t border-border" : ""
                }`}
              >
                <h3 className="font-semibold text-foreground">{row.layer}</h3>
                <p className="leading-7 text-muted-foreground">{row.review}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 sm:py-24">
        <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Production gate
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              A practical pre-launch checklist
            </h2>
            <p className="mt-5 leading-7 text-muted-foreground">
              Adapt this list to your risk assessment, jurisdiction, call flows,
              provider contracts, and internal control framework.
            </p>
          </div>

          <ol className="space-y-4">
            {deploymentChecklist.map((item, index) => (
              <li
                key={item}
                className="flex gap-4 rounded-xl border border-border bg-card p-5"
              >
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Gate {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="mt-1 leading-7 text-foreground">{item}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-border bg-primary/5 px-6 py-16">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-semibold">
              Start with source-level evidence
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Review the repository, document gaps as issues, and involve the
              right legal and security owners before regulated production use.
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
