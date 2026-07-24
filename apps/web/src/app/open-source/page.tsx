import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ExternalLink, GitFork } from "lucide-react";
import {
  OpenSourcePageView,
  QuickstartCopyButton,
} from "@/components/open-source/open-source-interactions";
import {
  GITHUB_CONTRIBUTING_URL,
  GITHUB_DISCUSSIONS_URL,
  GITHUB_DOCS_URL,
  GITHUB_ISSUES_URL,
  GITHUB_LICENSE_URL,
  GITHUB_RELEASES_URL,
  GITHUB_REPO_URL,
  GITHUB_SECURITY_URL,
} from "@/lib/links";

const QUICKSTART_COMMANDS = `git clone ${GITHUB_REPO_URL}.git
cd QuickVoice
task up:dev`;

const architectureComponents = [
  {
    index: "01",
    path: "apps/web",
    title: "Product website",
    description:
      "Next.js product pages, use cases, industry pages, blog content, pricing, and legal pages.",
  },
  {
    index: "02",
    path: "apps/console",
    title: "Customer console",
    description:
      "Organizations, agents, phone numbers, calls, knowledge bases, API keys, billing, and settings.",
  },
  {
    index: "03",
    path: "apps/server",
    title: "Control plane",
    description:
      "Express API for authentication, permissions, agent configuration, call workflows, providers, and retention jobs.",
  },
  {
    index: "04",
    path: "apps/ai",
    title: "Voice runtime",
    description:
      "Python API and LiveKit workers for runtime configuration, retrieval, tools, privacy controls, and voice-agent execution.",
  },
] as const;

const credentialBoundaries = [
  {
    surface: "Local development",
    credentials: "Generated development environment files",
    boundary:
      "The task runner starts the local product services, Postgres, and Redis. Included database values are development-only placeholders.",
  },
  {
    surface: "Voice sessions",
    credentials: "LiveKit and configured speech or model providers",
    boundary:
      "Live voice uses credentials supplied by the operator for the selected runtime providers.",
  },
  {
    surface: "Carrier calls",
    credentials: "Twilio or Telnyx, plus LiveKit",
    boundary:
      "A fresh clone does not place real phone calls until carrier and LiveKit credentials are configured.",
  },
  {
    surface: "Optional services",
    credentials: "Stripe, OAuth, SMTP, and S3-compatible storage",
    boundary:
      "These credentials are needed only for the corresponding billing, sign-in, email, and object-storage paths.",
  },
] as const;

const contributorLinks = [
  {
    label: "Repository",
    detail: "Inspect the source and project history.",
    href: GITHUB_REPO_URL,
  },
  {
    label: "Documentation",
    detail: "Read architecture, operations, and positioning notes.",
    href: GITHUB_DOCS_URL,
  },
  {
    label: "Contributing",
    detail: "Review the contribution workflow before opening a pull request.",
    href: GITHUB_CONTRIBUTING_URL,
  },
  {
    label: "Issues",
    detail: "Report a bug or propose a scoped improvement.",
    href: GITHUB_ISSUES_URL,
  },
  {
    label: "Discussions",
    detail: "Join project conversations on GitHub.",
    href: GITHUB_DISCUSSIONS_URL,
  },
  {
    label: "Releases",
    detail: "Follow published versions and release notes.",
    href: GITHUB_RELEASES_URL,
  },
] as const;

const openSourceSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: "QuickVoice",
  description:
    "Open-source, self-hostable AI phone-agent infrastructure with a Next.js console, Express API, LiveKit-powered Python worker, telephony integrations, and local development tooling.",
  url: "https://quickvoice.co/open-source",
  codeRepository: GITHUB_REPO_URL,
  license: GITHUB_LICENSE_URL,
  programmingLanguage: ["TypeScript", "Python"],
  runtimePlatform: ["Node.js", "Python", "Docker"],
};

export const metadata: Metadata = {
  title: "Open-Source AI Phone Agent Stack",
  description:
    "Inspect, run, and extend QuickVoice: an AGPL-licensed AI phone-agent stack with a console, Express API, LiveKit worker, telephony integrations, and local development tooling.",
  alternates: {
    canonical: "/open-source",
  },
  openGraph: {
    type: "website",
    url: "/open-source",
    title: "QuickVoice Open Source",
    description:
      "Inspect, run, and extend the QuickVoice AI phone-agent stack.",
  },
  twitter: {
    card: "summary_large_image",
    title: "QuickVoice Open Source",
    description:
      "Inspect, run, and extend the QuickVoice AI phone-agent stack.",
  },
};

function ExternalAction({
  href,
  children,
  location,
  dominant = false,
}: {
  href: string;
  children: React.ReactNode;
  location: string;
  dominant?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-analytics-location={location}
      className={
        dominant
          ? "inline-flex min-h-12 items-center justify-center gap-2 bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          : "inline-flex min-h-12 items-center justify-center gap-2 border border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
      }
    >
      {children}
    </a>
  );
}

export default function OpenSourcePage() {
  return (
    <>
      <OpenSourcePageView />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(openSourceSchema).replace(/</g, "\\u003c"),
        }}
      />

      <main className="min-h-screen overflow-hidden bg-background pt-16 text-foreground">
        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl border-x border-border">
            <div className="grid lg:grid-cols-12">
              <div className="border-b border-border px-6 py-16 sm:px-10 sm:py-20 lg:col-span-8 lg:border-r lg:border-b-0 lg:px-14 lg:py-24">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  AGPL-3.0-only · Source available on GitHub
                </p>
                <h1 className="mt-7 max-w-4xl text-balance text-5xl font-semibold tracking-[-0.055em] sm:text-6xl lg:text-7xl">
                  Own the voice-agent stack you operate.
                </h1>
                <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
                  QuickVoice puts the product website, customer console, Express
                  API, LiveKit-powered voice runtime, telephony integrations,
                  and local development tooling in one inspectable repository.
                </p>
                <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                  <ExternalAction
                    href={GITHUB_REPO_URL}
                    location="oss_hero"
                    dominant
                  >
                    <GitFork aria-hidden="true" className="size-4" />
                    View source on GitHub
                    <ArrowUpRight aria-hidden="true" className="size-4" />
                  </ExternalAction>
                  <ExternalAction href={GITHUB_DOCS_URL} location="oss_hero">
                    Read the documentation
                    <ArrowUpRight aria-hidden="true" className="size-4" />
                  </ExternalAction>
                </div>
              </div>

              <aside className="grid bg-muted/35 lg:col-span-4">
                {[
                  [
                    "Source",
                    "TypeScript and Python monorepo with local orchestration.",
                  ],
                  [
                    "Runtime",
                    "LiveKit workers connect configured speech, model, and telephony providers.",
                  ],
                  [
                    "Boundary",
                    "Real calls require operator-supplied LiveKit and carrier credentials.",
                  ],
                  ["License", "GNU Affero General Public License v3.0."],
                ].map(([label, value], index) => (
                  <div
                    key={label}
                    className={`grid grid-cols-[5rem_1fr] gap-5 px-6 py-6 sm:px-10 lg:px-8 ${
                      index > 0 ? "border-t border-border" : ""
                    }`}
                  >
                    <span className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary">
                      {label}
                    </span>
                    <p className="text-sm leading-6 text-foreground/80">
                      {value}
                    </p>
                  </div>
                ))}
              </aside>
            </div>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl border-x border-border">
            <div className="grid border-b border-border lg:grid-cols-12">
              <div className="px-6 py-10 sm:px-10 lg:col-span-4 lg:border-r lg:px-14">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Repository map
                </p>
              </div>
              <div className="px-6 pb-10 sm:px-10 lg:col-span-8 lg:px-14 lg:py-10">
                <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                  Four surfaces, one operational path.
                </h2>
                <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
                  The repository keeps the user-facing applications, control
                  plane, and voice runtime close enough to inspect their
                  boundaries together.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4">
              {architectureComponents.map((component, index) => (
                <article
                  key={component.path}
                  className={`min-h-72 p-6 sm:p-8 ${
                    index > 0 ? "border-t border-border sm:border-t-0" : ""
                  } ${index % 2 === 1 ? "sm:border-l sm:border-border" : ""} ${
                    index > 1
                      ? "sm:border-t sm:border-border lg:border-t-0"
                      : ""
                  } ${index > 0 ? "lg:border-l lg:border-border" : ""}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-mono text-3xl font-medium text-primary">
                      {component.index}
                    </span>
                    <code className="border border-border bg-muted px-2 py-1 font-mono text-[0.68rem] text-muted-foreground">
                      {component.path}
                    </code>
                  </div>
                  <h3 className="mt-16 text-xl font-semibold tracking-tight">
                    {component.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {component.description}
                  </p>
                </article>
              ))}
            </div>

            <div className="flex flex-col border-t border-border bg-muted/30 px-6 py-5 sm:px-10 lg:flex-row lg:items-center lg:px-14">
              {[
                "Browser",
                "Console and API",
                "LiveKit worker",
                "Twilio or Telnyx",
              ].map((step, index, steps) => (
                <div
                  key={step}
                  className="flex flex-1 items-center gap-3 py-2 lg:py-0"
                >
                  <span className="font-mono text-xs font-medium uppercase tracking-[0.1em] text-foreground/75">
                    {step}
                  </span>
                  {index < steps.length - 1 && (
                    <ArrowRight
                      aria-hidden="true"
                      className="ml-auto size-4 text-primary"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto grid max-w-7xl border-x border-border lg:grid-cols-12">
            <div className="border-b border-border px-6 py-14 sm:px-10 lg:col-span-5 lg:border-r lg:border-b-0 lg:px-14 lg:py-20">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Local quickstart
              </p>
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Inspect the complete development surface.
              </h2>
              <p className="mt-5 leading-7 text-muted-foreground">
                With Docker, Docker Compose, Go Task, Node.js, and Python 3
                available, the repository task runner prepares development
                environment files, dependencies, databases, migrations, and
                local services.
              </p>
              <a
                href={`${GITHUB_REPO_URL}#quick-start`}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                Read the full setup notes
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </a>
            </div>

            <div className="bg-slate-950 px-6 py-14 text-white sm:px-10 lg:col-span-7 lg:px-14 lg:py-20">
              <div className="flex items-center justify-between gap-4 border-b border-white/20 pb-4">
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-blue-300">
                  Terminal
                </span>
                <QuickstartCopyButton commands={QUICKSTART_COMMANDS} />
              </div>
              <pre className="overflow-x-auto py-8 font-mono text-sm leading-8 text-slate-100">
                <code>{QUICKSTART_COMMANDS}</code>
              </pre>
              <div className="grid border-t border-white/20 pt-6 text-sm sm:grid-cols-2">
                {[
                  ["Console", "http://localhost:3000"],
                  ["Website", "http://localhost:3001"],
                  ["API docs", "http://localhost:5000/api/v1/docs"],
                  ["AI health", "http://localhost:5555/health"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="grid grid-cols-[5rem_1fr] gap-3 py-2"
                  >
                    <span className="text-slate-400">{label}</span>
                    <code className="break-all font-mono text-xs text-white">
                      {value}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto max-w-7xl border-x border-border">
            <div className="grid border-b border-border lg:grid-cols-12">
              <div className="px-6 py-10 sm:px-10 lg:col-span-4 lg:border-r lg:px-14">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Credential boundaries
                </p>
              </div>
              <div className="px-6 pb-10 sm:px-10 lg:col-span-8 lg:px-14 lg:py-10">
                <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                  The source is open. Provider accounts remain yours.
                </h2>
              </div>
            </div>

            <div className="hidden grid-cols-[0.85fr_1.15fr_2fr] border-b border-border bg-muted/35 px-8 py-3 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid lg:px-14">
              <span>Surface</span>
              <span>Required credentials</span>
              <span>Operational boundary</span>
            </div>
            {credentialBoundaries.map((boundary) => (
              <article
                key={boundary.surface}
                className="grid gap-4 border-b border-border px-6 py-7 last:border-b-0 sm:px-10 md:grid-cols-[0.85fr_1.15fr_2fr] md:gap-8 lg:px-14"
              >
                <h3 className="font-semibold">{boundary.surface}</h3>
                <p className="text-sm leading-6 text-foreground/80">
                  {boundary.credentials}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {boundary.boundary}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-b border-border">
          <div className="mx-auto grid max-w-7xl border-x border-border lg:grid-cols-12">
            <div className="border-b border-border px-6 py-14 sm:px-10 lg:col-span-7 lg:border-r lg:border-b-0 lg:px-14 lg:py-20">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                License and responsibility
              </p>
              <h2 className="mt-5 max-w-3xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Built to be studied, changed, and operated in public.
              </h2>
              <p className="mt-6 max-w-2xl leading-7 text-muted-foreground">
                QuickVoice is licensed under the GNU Affero General Public
                License v3.0. You can use, study, modify, and distribute the
                code subject to its terms. Modified network deployments can
                carry corresponding-source obligations, so read the full license
                for the conditions that apply to your use.
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                This summary is not legal advice. The repository makes technical
                paths inspectable; it does not by itself certify a deployment or
                replace security, operations, provider-agreement, compliance, or
                legal review.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ExternalAction
                  href={GITHUB_LICENSE_URL}
                  location="oss_license"
                >
                  Read the license
                  <ExternalLink aria-hidden="true" className="size-4" />
                </ExternalAction>
                <ExternalAction
                  href={GITHUB_SECURITY_URL}
                  location="oss_license"
                >
                  Security policy
                  <ExternalLink aria-hidden="true" className="size-4" />
                </ExternalAction>
              </div>
            </div>
            <aside className="bg-primary px-6 py-14 text-primary-foreground sm:px-10 lg:col-span-5 lg:px-14 lg:py-20">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] opacity-75">
                Evaluate before production
              </p>
              <p className="mt-7 text-2xl font-semibold leading-9 tracking-[-0.025em]">
                Review authentication, secrets, storage, call data, recordings,
                transcripts, retention, and provider agreements for your own
                deployment.
              </p>
              <Link
                href="/privacy-policy"
                className="mt-10 inline-flex items-center gap-2 border-b border-current pb-1 text-sm font-semibold"
              >
                Read the site privacy policy
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </aside>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-7xl border-x border-border">
            <div className="grid border-b border-border lg:grid-cols-12">
              <div className="px-6 py-10 sm:px-10 lg:col-span-4 lg:border-r lg:px-14">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Build in public
                </p>
              </div>
              <div className="px-6 pb-10 sm:px-10 lg:col-span-8 lg:px-14 lg:py-10">
                <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                  Start with the source. Continue with the community.
                </h2>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3">
              {contributorLinks.map((item, index) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  data-analytics-location="oss_contributor_grid"
                  className={`group min-h-52 p-6 transition-colors hover:bg-muted sm:p-8 ${
                    index > 0 ? "border-t border-border sm:border-t-0" : ""
                  } ${index % 2 === 1 ? "sm:border-l sm:border-border" : ""} ${
                    index > 1 ? "sm:border-t sm:border-border" : ""
                  } ${index % 3 !== 0 ? "lg:border-l lg:border-border" : ""} ${
                    index > 2 ? "lg:border-t lg:border-border" : "lg:border-t-0"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                      {item.label}
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    />
                  </div>
                  <p className="mt-16 max-w-xs text-sm leading-6 text-muted-foreground">
                    {item.detail}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
