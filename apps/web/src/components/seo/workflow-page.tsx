import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { WorkflowPageContent } from "@/data/workflow-pages";
import { CONTACT_URL, DEMO_BOOKING_URL, GITHUB_DOCS_URL } from "@/lib/links";

export function workflowMetadata(page: WorkflowPageContent): Metadata {
  const title = `${page.label} for business`;
  const url = `https://quickvoice.co${page.path}`;
  return {
    title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: page.description,
      url,
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: page.description,
      images: ["/og-image.png"],
    },
  };
}

export function WorkflowPage({ page }: { page: WorkflowPageContent }) {
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://quickvoice.co",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: page.label,
          item: `https://quickvoice.co${page.path}`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faqs.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ];
  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
        }}
      />
      <section className="page-section border-b border-border bg-secondary/60">
        <div className="site-container">
          <nav
            aria-label="Breadcrumb"
            className="text-sm text-muted-foreground"
          >
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link
                  href="/"
                  className="inline-flex min-h-11 items-center hover:text-primary"
                >
                  QuickVoice
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">{page.label}</li>
            </ol>
          </nav>
          <p className="eyebrow mb-5 mt-6">{page.label}</p>
          <h1 className="page-title max-w-4xl">{page.title}</h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-muted-foreground">
            {page.introduction}
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link
              href={DEMO_BOOKING_URL}
              data-analytics-location={page.path}
              className="inline-flex min-h-12 items-center gap-2 rounded-[10px] bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              Book a demo <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="#evaluation"
              className="inline-flex min-h-12 items-center rounded-[10px] border border-border bg-card px-6 py-3 font-semibold hover:bg-muted"
            >
              Explore the pilot checklist
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Self-hostable software. Real calls require provider accounts and a
            technical implementation owner.
          </p>
        </div>
      </section>
      <section
        className="site-container page-section"
        aria-labelledby="workflow-heading"
      >
        <h2 id="workflow-heading" className="text-3xl font-semibold">
          Plan the caller experience
        </h2>
        <div className="mt-9 grid gap-6 md:grid-cols-3">
          {page.steps.map((step, index) => (
            <article key={step.title} className="surface-card">
              <p className="text-sm font-semibold text-primary">0{index + 1}</p>
              <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
              <p className="mt-4 leading-7 text-muted-foreground">
                {step.body}
              </p>
            </article>
          ))}
        </div>
      </section>
      <section className="page-section border-y border-border bg-secondary/60">
        <div className="site-container grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold">What your team needs</h2>
            <p className="mt-5 leading-7 text-muted-foreground">
              QuickVoice provides agent configuration, knowledge retrieval,
              phone integrations, and call records. Your implementation connects
              the business systems and defines how people handle exceptions.
            </p>
            <Link
              href="/open-source"
              className="mt-6 inline-block font-medium text-primary underline underline-offset-4"
            >
              Review the platform and setup boundaries
            </Link>
          </div>
          <ul className="space-y-5">
            {page.requirements.map((item) => (
              <li key={item} className="flex gap-3 leading-7">
                <CheckCircle2
                  className="mt-1 size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section id="evaluation" className="site-container page-section">
        <h2 className="text-3xl font-semibold">
          Test exceptions before the pilot
        </h2>
        <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
          Use representative calls, an agreed success definition, and a staff
          owner. The examples below are evaluation criteria, not reported
          customer results.
        </p>
        <div
          className="mt-8 overflow-x-auto rounded-2xl border border-border"
          role="region"
          aria-label={`${page.label} evaluation table`}
          tabIndex={0}
        >
          <table className="w-full min-w-[560px] text-left text-base">
            <caption className="sr-only">
              {page.label} evaluation scenarios
            </caption>
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="p-5">
                  Scenario
                </th>
                <th scope="col" className="p-5">
                  Expected behavior to verify
                </th>
              </tr>
            </thead>
            <tbody>
              {page.checks.map((check) => (
                <tr key={check.scenario} className="border-t border-border">
                  <th scope="row" className="p-5 font-medium align-top">
                    {check.scenario}
                  </th>
                  <td className="p-5 leading-7 text-muted-foreground">
                    {check.expected}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 leading-7 text-muted-foreground">
          Include human follow-up, provider charges, hosting, implementation,
          and monitoring in your budget.{" "}
          <Link
            href="/pricing"
            className="text-primary underline underline-offset-4"
          >
            Review current pricing
          </Link>
          .
        </p>
      </section>
      <section className="site-container max-w-3xl pb-12 md:pb-18">
        <h2 className="text-3xl font-semibold">Questions to resolve</h2>
        <dl className="mt-8 divide-y divide-border">
          {page.faqs.map((faq) => (
            <div key={faq.question} className="py-6">
              <dt className="text-lg font-semibold">{faq.question}</dt>
              <dd className="mt-3 leading-7 text-muted-foreground">
                {faq.answer}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="page-section border-t border-border bg-secondary/60">
        <div className="site-container">
          <h2 className="text-3xl font-semibold">Explore the buyer guides</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {page.guides.map((guide) => (
              <Link
                key={guide.slug}
                href={`/blog/${guide.slug}`}
                className="rounded-xl border border-border bg-background p-6 font-medium hover:border-primary"
              >
                {guide.title}
                <ArrowRight
                  className="mt-4 size-5 text-primary"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
          <a
            href={GITHUB_DOCS_URL}
            className="mt-8 inline-block text-sm text-primary underline underline-offset-4"
          >
            Implementation documentation and prerequisites
          </a>
        </div>
      </section>
      <section className="site-container page-section max-w-3xl text-center">
        <h2 className="text-3xl font-semibold">
          Start with one measurable workflow
        </h2>
        <p className="mt-5 leading-7 text-muted-foreground">
          Bring your call types, current process, systems, and escalation
          requirements. Identify a practical pilot and the work required to run
          it.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <a
              href={DEMO_BOOKING_URL}
              data-analytics-location={`${page.path}_footer`}
            >
              Book a demo <ArrowRight aria-hidden="true" />
            </a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link
              href={CONTACT_URL}
              data-analytics-location={`${page.path}_footer`}
            >
              Contact the team
            </Link>
          </Button>
        </div>
        <Link
          href="/resources"
          className="mt-6 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4"
        >
          Download the pilot planning resources
        </Link>
      </section>
    </div>
  );
}
