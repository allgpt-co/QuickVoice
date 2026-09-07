import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OpenSourcePageView,
  QuickstartCopyButton,
} from "@/components/open-source/open-source-interactions";
import {
  CONTACT_URL,
  DEMO_BOOKING_URL,
  REGISTER_URL,
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
    "Inspect, run, and extend QuickVoice: an MIT-licensed AI phone-agent stack with a console, Express API, LiveKit worker, telephony integrations, and local development tooling.",
  alternates: {
    canonical: "/open-source",
  },
  openGraph: {
    type: "website",
    url: "/open-source",
    title: "QuickVoice Open Source",
    description:
      "Inspect, run, and extend the QuickVoice AI phone-agent stack.",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "QuickVoice Open Source",
    description:
      "Inspect, run, and extend the QuickVoice AI phone-agent stack.",
    images: ["/og-image.png"],
  },
};

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
      <div className="bg-background text-foreground">
        <section className="page-section border-b border-border">
          <div className="site-container grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <p className="eyebrow">MIT licensed · Open source</p>
              <h1 className="page-title mt-4">
                Your voice workflow. Source you can inspect.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                QuickVoice brings a customer console, API, voice runtime, and
                development tooling into one repository. Review the
                implementation before deciding how to operate it.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <a href={DEMO_BOOKING_URL} data-analytics-location="oss_hero">
                    Book a demo <ArrowRight aria-hidden="true" />
                  </a>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href={GITHUB_REPO_URL} data-analytics-location="oss_hero">
                    <Code2 aria-hidden="true" /> View source on GitHub
                  </a>
                </Button>
              </div>
              <a
                href={GITHUB_DOCS_URL}
                data-analytics-location="oss_hero"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-4"
              >
                Read the documentation{" "}
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </a>
            </div>
            <aside
              className="surface-card p-6 sm:p-8"
              aria-label="Deployment at a glance"
            >
              <p className="eyebrow">At a glance</p>
              <dl className="mt-5 divide-y divide-border">
                {[
                  ["Source", "TypeScript and Python"],
                  ["Voice runtime", "LiveKit workers and configured providers"],
                  ["License", "MIT"],
                  ["Project status", "Under active development"],
                ].map(([label, value]) => (
                  <div key={label} className="py-4">
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          </div>
        </section>

        <section className="page-section">
          <div className="site-container">
            <p className="eyebrow">Repository map</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Follow the path from configuration to call.
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {architectureComponents.map((item) => (
                <article key={item.path} className="surface-card p-6">
                  <code className="text-xs text-primary">{item.path}</code>
                  <h3 className="mt-5 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="page-section border-y border-border bg-muted/25">
          <div className="site-container grid gap-8 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="eyebrow">Local quickstart</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Start with a development environment.
              </h2>
              <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
                With Docker, Docker Compose, Go Task, Node.js, and Python 3
                available, the task runner prepares development environment
                files, dependencies, databases, migrations, and local services.
              </p>
              <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
                Real calls still require your configured voice, model, and
                carrier providers. Review the full setup notes before running
                the commands.
              </p>
              <a
                href={`${GITHUB_REPO_URL}#quick-start`}
                data-analytics-location="oss_quickstart"
                className="mt-6 inline-flex items-center gap-2 font-medium text-primary underline underline-offset-4"
              >
                Read the setup notes{" "}
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </a>
            </div>
            <div className="min-w-0 rounded-2xl border border-slate-700 bg-slate-950 p-5 text-white sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-4">
                <span className="font-mono text-xs text-blue-300">
                  Terminal
                </span>
                <QuickstartCopyButton commands={QUICKSTART_COMMANDS} />
              </div>
              <pre
                role="region"
                tabIndex={0}
                aria-label="Local quickstart commands"
                className="overflow-x-auto py-6 font-mono text-sm leading-8 text-slate-100"
              >
                <code>{QUICKSTART_COMMANDS}</code>
              </pre>
              <dl className="grid gap-4 border-t border-slate-700 pt-5 text-xs sm:grid-cols-2">
                {[
                  ["Console", "http://localhost:3000"],
                  ["Website", "http://localhost:3001"],
                  ["API docs", "http://localhost:5000/api/v1/docs"],
                  ["AI health", "http://localhost:5555/health"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-slate-300">{label}</dt>
                    <dd className="mt-1 break-all font-mono text-white">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section className="page-section">
          <div className="site-container">
            <p className="eyebrow">Deployment requirements</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Connect the services your workflow needs.
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {credentialBoundaries.map((item) => (
                <article key={item.surface} className="surface-card p-6">
                  <h3 className="text-lg font-semibold">{item.surface}</h3>
                  <p className="mt-2 text-sm font-medium text-primary">
                    {item.credentials}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {item.boundary}
                  </p>
                </article>
              ))}
            </div>
            <aside className="mt-6 rounded-xl border border-border bg-muted/40 p-6">
              <h3 className="font-semibold">
                Define permitted actions before testing
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                The default live-call MCP bridge restricts tools marked as
                writes or side effects. Booking, refunds, and other system
                changes need a separately implemented permitted action path and
                a verified result from the destination system.
              </p>
            </aside>
          </div>
        </section>

        <section className="page-section border-y border-border bg-muted/25">
          <div className="site-container grid gap-8 lg:grid-cols-2">
            <div>
              <p className="eyebrow">License</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                MIT licensed, with terms you can read.
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                The MIT license permits use, modification, distribution, and
                commercial use, subject to retaining the copyright and
                permission notice. The software is supplied without warranty.
                Read the repository license for the full terms.
              </p>
              <a
                href={GITHUB_LICENSE_URL}
                data-analytics-location="oss_license"
                className="mt-5 inline-flex items-center gap-2 font-medium text-primary underline underline-offset-4"
              >
                Read the MIT license{" "}
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </a>
            </div>
            <div className="surface-card p-6 sm:p-8">
              <h3 className="text-xl font-semibold">
                Review your deployment before production.
              </h3>
              <p className="mt-4 leading-7 text-muted-foreground">
                Review authentication, secrets, storage, call data, recordings,
                transcripts, retention, and provider agreements for your
                environment. Source access does not certify a deployment or
                replace operational and compliance review.
              </p>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-primary">
                <a
                  href={GITHUB_SECURITY_URL}
                  data-analytics-location="oss_license"
                  className="underline underline-offset-4"
                >
                  Security policy
                </a>
                <Link
                  href="/privacy-policy"
                  className="underline underline-offset-4"
                >
                  Site privacy policy
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="page-section">
          <div className="site-container">
            <p className="eyebrow">For builders</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Explore, contribute, and follow the project.
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {contributorLinks.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  data-analytics-location="oss_contributor_grid"
                  className="surface-card group p-6 transition-colors hover:border-primary"
                >
                  <span className="flex items-center justify-between gap-4 text-lg font-semibold">
                    {item.label}
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-4 text-primary"
                    />
                  </span>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {item.detail}
                  </p>
                </a>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Prefer the hosted console?{" "}
              <Link
                href={REGISTER_URL}
                data-analytics-location="oss_technical"
                className="font-medium text-primary underline underline-offset-4"
              >
                Create an account
              </Link>{" "}
              and review your available wallet credit before testing.
            </p>
          </div>
        </section>

        <section className="page-section border-t border-border bg-muted/25">
          <div className="site-container">
            <h2 className="text-3xl font-semibold tracking-tight">
              Connect the source to your business workflow.
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
              Bring your call requirements and technical questions to a demo, or
              send the team a written enquiry.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href={DEMO_BOOKING_URL} data-analytics-location="oss_footer">
                  Book a demo <ArrowRight aria-hidden="true" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={CONTACT_URL} data-analytics-location="oss_footer">
                  Contact the team
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
