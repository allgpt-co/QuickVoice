import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import type { WorkflowPageContent } from "@/data/workflow-pages";
import { CONTACT_URL } from "@/lib/links";

const resource = "/resources/property-management-call-intake";
const textLink =
  "inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4";
const primaryLink =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-center font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

/** The existing commercial URL owns the offer; examples are not execution evidence. */
export function PropertyManagementPage({
  page,
}: {
  page: WorkflowPageContent;
}) {
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
          name: "Industries",
          item: "https://quickvoice.co/industries",
        },
        {
          "@type": "ListItem",
          position: 3,
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
    <div className="bg-background text-foreground">
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
                  href="/industries"
                  className="inline-flex min-h-11 items-center hover:text-primary"
                >
                  Industries
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">Property management</li>
            </ol>
          </nav>
          <p className="eyebrow mb-5 mt-6">After-hours leasing intake</p>
          <h1 className="page-title max-w-4xl">{page.title}</h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-muted-foreground">
            {page.introduction}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href={`${CONTACT_URL}#enquiry`}
              data-analytics-location="property_management_hero"
              className={primaryLink}
            >
              Discuss a leasing-intake pilot{" "}
              <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
            <Link
              href={resource}
              className="inline-flex min-h-12 items-center rounded-lg border border-border bg-card px-6 py-3 font-semibold hover:bg-muted"
            >
              Read the example call and checklist
            </Link>
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-6 text-muted-foreground">
            Self-hostable software with separately scoped assistance. Not a
            staffed call center, a property-management system, or a
            confirmed-booking service.
          </p>
        </div>
      </section>

      <section
        className="site-container page-section"
        aria-labelledby="pilot-fit"
      >
        <h2 id="pilot-fit" className="text-3xl font-semibold">
          A focused starting point for your leasing team
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <article className="surface-card">
            <h3 className="text-xl font-semibold">A fit for a scoped pilot</h3>
            <p className="mt-4 leading-7 text-muted-foreground">
              US residential property managers with after-hours leasing
              enquiries, maintained listing facts, and a named person to review
              requests. Start with one property-information set and an agreed
              staff-review process.
            </p>
          </article>
          <article className="surface-card">
            <h3 className="text-xl font-semibold">
              Keep these outside the first workflow
            </h3>
            <p className="mt-4 leading-7 text-muted-foreground">
              Emergency maintenance, tenant-record disclosure, applicant
              screening, price commitments, autonomous dispatch, and automatic
              property-system updates. Define approved fallback instructions
              before routing any live calls.
            </p>
          </article>
        </div>
      </section>

      <section
        className="page-section border-y border-border bg-secondary/60"
        aria-labelledby="leasing-workflow"
      >
        <div className="site-container">
          <h2 id="leasing-workflow" className="text-3xl font-semibold">
            From a question to staff-owned follow-up
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {page.steps.map((step, index) => (
              <li key={step.title} className="surface-card">
                <p className="text-sm font-semibold text-primary">
                  Step {index + 1}
                </p>
                <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                <p className="mt-4 leading-7 text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="site-container page-section"
        aria-labelledby="example-call"
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Fictional planning example</p>
            <h2 id="example-call" className="mt-4 text-3xl font-semibold">
              A viewing preference is not a reservation
            </h2>
            <p className="mt-5 leading-7 text-muted-foreground">
              A prospective renter asks to view a property after work. The
              intended response confirms the property and preference, collects
              callback details, and explains that staff still need to confirm
              the appointment.
            </p>
            <p className="mt-4 leading-7 text-muted-foreground">
              This is a written example, not a recorded call, executed test, or
              customer result. The linked pack contains 30 unexecuted synthetic
              test cases and blank evidence fields.
            </p>
            <Link href={resource} className={`${textLink} mt-5`}>
              Read the script and download the test pack{" "}
              <ArrowRight aria-hidden="true" className="ml-2 size-4" />
            </Link>
          </div>
          <div className="surface-card">
            <ClipboardCheck
              aria-hidden="true"
              className="size-6 text-primary"
            />
            <h3 className="mt-4 text-xl font-semibold">
              What a real pilot must demonstrate
            </h3>
            <ul className="mt-5 list-disc space-y-3 pl-5 leading-7 text-muted-foreground">
              <li>
                The final callback details and property reference match the
                call.
              </li>
              <li>
                The request is actually saved and inspected by a staff owner.
              </li>
              <li>
                Missing facts and failed handoffs remain visible and unresolved.
              </li>
              <li>
                No viewing is described as booked without a verified booking.
              </li>
            </ul>
            <p className="mt-5 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
              Measure complete, correctly persisted requests acknowledged by
              staff against eligible leasing calls. Report corrections and
              unresolved follow-ups too—not assumed leases or revenue.
            </p>
          </div>
        </div>
      </section>

      <section
        className="page-section border-y border-border bg-secondary/60"
        aria-labelledby="pilot-scope"
      >
        <div className="site-container grid gap-10 lg:grid-cols-2">
          <div>
            <h2 id="pilot-scope" className="text-3xl font-semibold">
              Agree the responsibilities before routing calls
            </h2>
            <ul className="mt-6 list-disc space-y-4 pl-5 leading-7 text-muted-foreground">
              {page.requirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-5 leading-7 text-muted-foreground">
              The starting process uses call-record review and a private staff
              acknowledgement log. Automated delivery, transfers, calendar
              booking, or PMS writes are separate work—not included capabilities
              inferred from the presence of an API.
            </p>
            <Link
              href="/blog/property-management-phone-agent-integration-checklist"
              className={`${textLink} mt-4`}
            >
              Check the integration requirements
            </Link>
          </div>
          <div>
            <h3 className="text-2xl font-semibold">
              Budget for the whole workflow
            </h3>
            <p className="mt-5 leading-7 text-muted-foreground">
              Include telephony and AI providers, hosting, configuration,
              knowledge maintenance, staff review, follow-up, and any
              integration work. Agree pilot scope and assistance costs before
              starting; software access does not make operating calls free.
            </p>
            <div className="mt-5 flex flex-col items-start">
              <Link href="/pricing" className={textLink}>
                Review current pricing and cost boundaries
              </Link>
              <Link
                href="/blog/property-management-answering-service-cost"
                className={textLink}
              >
                Estimate property-management answering costs
              </Link>
              <Link href="/resources#costs" className={textLink}>
                Use the existing cost worksheet
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        className="site-container page-section"
        aria-labelledby="pilot-exceptions"
      >
        <h2 id="pilot-exceptions" className="text-3xl font-semibold">
          Test the exceptions, not just the easy call
        </h2>
        <dl className="mt-8 grid gap-6 md:grid-cols-2">
          {page.checks.map(({ scenario, expected }) => (
            <div key={scenario} className="border-l-2 border-primary pl-5">
              <dt className="text-lg font-semibold">{scenario}</dt>
              <dd className="mt-3 leading-7 text-muted-foreground">
                {expected}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        className="site-container max-w-3xl pb-12 md:pb-18"
        aria-labelledby="pilot-questions"
      >
        <h2 id="pilot-questions" className="text-3xl font-semibold">
          Questions to resolve
        </h2>
        <dl className="mt-8 divide-y divide-border">
          {page.faqs.map(({ question, answer }) => (
            <div key={question} className="py-6">
              <dt className="text-lg font-semibold">{question}</dt>
              <dd className="mt-3 leading-7 text-muted-foreground">{answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        className="page-section border-y border-border bg-secondary/60"
        aria-labelledby="property-guides"
      >
        <div className="site-container">
          <h2 id="property-guides" className="text-3xl font-semibold">
            Evaluate the workflow in detail
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {page.guides.map((guide) => (
              <Link
                key={guide.slug}
                href={`/blog/${guide.slug}`}
                className="rounded-xl border border-border bg-background p-6 font-medium hover:border-primary"
              >
                {guide.title}
                <ArrowRight
                  aria-hidden="true"
                  className="mt-4 size-5 text-primary"
                />
              </Link>
            ))}
          </div>
          <Link href="/open-source" className={`${textLink} mt-6`}>
            Inspect the platform and implementation prerequisites
          </Link>
        </div>
      </section>

      <section
        className="site-container page-section"
        aria-labelledby="pilot-enquiry"
      >
        <h2 id="pilot-enquiry" className="text-3xl font-semibold">
          Scope one leasing-intake pilot
        </h2>
        <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
          Bring your approximate portfolio size, call volume, current systems,
          and staff follow-up process. Keep tenant records and sensitive caller
          information out of the initial enquiry. We will discuss the workflow
          and implementation needed—not promise a ready-made integration.
        </p>
        <Link
          href={`${CONTACT_URL}#enquiry`}
          data-analytics-location="property_management_footer"
          className={`${primaryLink} mt-7`}
        >
          Discuss a leasing-intake pilot{" "}
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      </section>
    </div>
  );
}
