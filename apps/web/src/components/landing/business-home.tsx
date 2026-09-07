import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Code2,
  Headphones,
  MessageSquareText,
  Phone,
  PhoneIncoming,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTACT_URL, DEMO_BOOKING_URL } from "@/lib/links";

export const buyerFaqs = [
  {
    question: "What can I explore in a demo?",
    answer:
      "Bring a call type your team handles today: reception, appointment requests, support, or sales follow-up. We can discuss the caller journey, the information it needs, and the implementation work required for a focused pilot.",
  },
  {
    question: "Can an agent book appointments or update my business systems?",
    answer:
      "These actions depend on the integrations you implement. An appointment request is not a confirmed booking until your scheduling system accepts it. Your team defines verification, permissions, and the fallback when an action cannot be completed.",
  },
  {
    question: "What happens when a caller needs a person?",
    answer:
      "Plan an explicit escalation path for each workflow. Depending on your configured telephony and business systems, that may involve a transfer or a request for staff follow-up. Test availability, failed transfers, and after-hours calls before a pilot.",
  },
  {
    question: "Can we host QuickVoice ourselves?",
    answer:
      "Yes. QuickVoice is MIT-licensed, self-hostable software. Your technical team operates the deployment and connects provider accounts. Real phone calls require LiveKit and a configured telephony provider such as Twilio or Telnyx.",
  },
  {
    question: "What should we include in the budget?",
    answer:
      "Budget for AI and telephony usage, phone numbers, hosting, implementation, monitoring, and human follow-up. Hosted usage pricing and self-hosted operating costs are explained on the pricing page.",
  },
  {
    question: "How do we evaluate whether it works for us?",
    answer:
      "Start with one call type, representative test calls, a named implementation owner, and a clear definition of success. Review incorrect answers, action failures, and human handoffs alongside cost and completion rates.",
  },
];

const workflows = [
  {
    icon: PhoneIncoming,
    title: "Reception & answering",
    description:
      "Understand why someone is calling, collect useful details, and plan the right follow-up.",
    href: "/solutions/ai-receptionist",
    label: "Explore reception",
  },
  {
    icon: CalendarDays,
    title: "Appointment requests",
    description:
      "Capture preferred times and define how your scheduling system confirms the appointment.",
    href: "/use-cases/appointment-scheduling",
    label: "Explore scheduling",
  },
  {
    icon: Headphones,
    title: "Customer support",
    description:
      "Use approved knowledge for routine questions, with an explicit path to a person.",
    href: "/use-cases/customer-support",
    label: "Explore support",
  },
  {
    icon: Users,
    title: "Sales qualification",
    description:
      "Structure enquiries, capture context, and prepare a useful next step for your sales team.",
    href: "/use-cases/sales-lead-gen",
    label: "Explore sales workflows",
  },
];

function WorkflowIllustration() {
  return (
    <figure className="relative min-w-0 rounded-3xl border border-border bg-card p-5 shadow-[0_24px_80px_-40px_rgba(37,99,235,0.35)] sm:p-8">
      <figcaption className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <span className="text-sm font-semibold">An appointment request</span>
        <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          Illustrative workflow
        </span>
      </figcaption>
      <ol className="space-y-2">
        <li>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Phone className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                01 · Understand
              </p>
              <p className="mt-1 text-base font-medium">
                “Could I arrange a visit next week?”
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Identify the request and the details needed.
              </p>
            </div>
          </div>
          <ArrowDown
            className="my-3 ml-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </li>
        <li>
          <div className="rounded-xl border border-border bg-secondary p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ClipboardList className="size-4" aria-hidden="true" />
              02 · Capture the context
            </div>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Request</dt>
              <dd className="font-medium">Arrange a visit</dd>
              <dt className="text-muted-foreground">Preference</dt>
              <dd className="font-medium">Next week</dd>
              <dt className="text-muted-foreground">Next step</dt>
              <dd className="font-medium">Check availability</dd>
            </dl>
          </div>
          <ArrowDown
            className="my-3 ml-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </li>
        <li className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-primary">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              03 · Define the next step
            </p>
            <p className="mt-1 text-base font-medium">
              Confirm through your system—or follow up.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Booking needs a connected scheduling system. Staff handle
              exceptions.
            </p>
          </div>
        </li>
      </ol>
    </figure>
  );
}

export function BusinessHome() {
  return (
    <>
      <section className="relative border-b border-border bg-secondary/50">
        <div className="site-container grid items-center gap-12 py-12 md:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <p className="eyebrow mb-6">AI phone agents for business</p>
            <h1 className="page-title max-w-2xl">
              Your calls.
              <br />
              <span className="text-primary">A clear next step.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              Build a useful first response for reception, appointment requests,
              support, and sales—with a clear path back to your team.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href={DEMO_BOOKING_URL} data-analytics-location="home_hero">
                  Book a demo
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="#workflows">
                  Explore workflows
                  <ArrowDown aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden="true" />
                Open source
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden="true" />
                Self-hostable
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden="true" />
                Built for your workflow
              </span>
            </div>
          </div>
          <WorkflowIllustration />
        </div>
      </section>

      <section
        id="workflows"
        className="page-section site-container"
        aria-labelledby="workflows-title"
      >
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="eyebrow mb-3">Start with the call you know</p>
            <h2
              id="workflows-title"
              className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl"
            >
              One useful workflow.
              <br />A practical place to begin.
            </h2>
          </div>
          <Link
            href="/use-cases"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
          >
            All workflows
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {workflows.map(({ icon: Icon, ...item }) => (
            <article key={item.href} className="surface-card flex flex-col">
              <Icon className="size-6 text-primary" aria-hidden="true" />
              <h3 className="mt-6 text-xl font-semibold">{item.title}</h3>
              <p className="mt-3 mb-6 text-base leading-7 text-muted-foreground">
                {item.description}
              </p>
              <Link
                href={item.href}
                className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
              >
                {item.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="page-section border-y border-border bg-secondary/60">
        <div className="site-container grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
          <div>
            <p className="eyebrow mb-3">Clear responsibilities</p>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Give your agent context.
              <br />
              Keep your team in control.
            </h2>
            <p className="mt-5 text-muted-foreground">
              A useful phone agent needs more than a script. Define what it can
              answer, what it can do, and when a person takes over.
            </p>
            <Link
              href="/open-source"
              className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
            >
              Explore the platform
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {[
              [
                MessageSquareText,
                "The caller experience",
                "Use QuickVoice’s agent configuration and knowledge sources to shape the conversation around approved information.",
              ],
              [
                Code2,
                "Your connected systems",
                "Your implementation connects providers and business actions, including the checks needed before confirming a change.",
              ],
              [
                Users,
                "The human next step",
                "Name an owner for exceptions, review call records, and test escalation before putting a workflow into a pilot.",
              ],
            ].map(([Icon, title, text]) => {
              const ItemIcon = Icon as typeof Users;
              return (
                <div
                  key={title as string}
                  className="flex gap-4 py-6 first:pt-0 last:pb-0"
                >
                  <ItemIcon
                    className="mt-1 size-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="text-lg font-semibold">{title as string}</h3>
                    <p className="mt-2 text-base leading-7 text-muted-foreground">
                      {text as string}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="page-section site-container"
        aria-labelledby="resources-title"
      >
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow mb-3">Make an informed decision</p>
            <h2
              id="resources-title"
              className="text-3xl font-semibold tracking-tight md:text-4xl"
            >
              A little clarity before you build.
            </h2>
          </div>
          <Link
            href="/resources"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
          >
            All buyer resources
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              title: "Plan your evaluation",
              description:
                "Use practical worksheets and checklists to define your pilot and compare options.",
              href: "/resources",
              label: "Get the resources",
              icon: ClipboardList,
            },
            {
              title: "Understand the costs",
              description:
                "Review hosted usage pricing and the costs your team owns when self-hosting.",
              href: "/pricing",
              label: "Explore pricing",
              icon: BookOpen,
            },
            {
              title: "Learn the details",
              description:
                "Read guides on call workflows, implementation choices, and industry requirements.",
              href: "/blog",
              label: "Browse the guides",
              icon: MessageSquareText,
            },
          ].map(({ icon: Icon, ...item }) => (
            <article
              key={item.href}
              className="surface-card flex flex-col bg-secondary/40"
            >
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-5 text-xl font-semibold">{item.title}</h3>
              <p className="mb-5 mt-3 text-base leading-7 text-muted-foreground">
                {item.description}
              </p>
              <Link
                className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
                href={item.href}
              >
                {item.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="page-section border-t border-border">
        <div className="site-container grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="eyebrow mb-3">Before your first call</p>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Good questions.
              <br />
              Clear expectations.
            </h2>
            <p className="mt-5 text-base text-muted-foreground">
              Start here, or{" "}
              <Link
                href={CONTACT_URL}
                data-analytics-location="home_faq"
                className="text-primary underline underline-offset-4"
              >
                contact the team
              </Link>{" "}
              about your specific workflow.
            </p>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {buyerFaqs.map((faq) => (
              <details key={faq.question} className="group py-1">
                <summary className="flex min-h-16 list-none items-center justify-between gap-6 py-5 text-base font-semibold">
                  {faq.question}
                  <ArrowDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform"
                    aria-hidden="true"
                  />
                </summary>
                <p className="pb-5 text-base leading-7 text-muted-foreground">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="site-container pb-12 md:pb-18">
        <div className="rounded-3xl border border-border bg-secondary p-7 sm:p-12 lg:flex lg:items-center lg:justify-between lg:gap-12">
          <div>
            <p className="eyebrow mb-3">Let’s talk about your calls</p>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Bring one workflow.
              <br />
              Explore what comes next.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Walk through your process, the systems it depends on, and what a
              useful pilot would need.
            </p>
          </div>
          <div className="mt-7 flex shrink-0 flex-col items-start gap-3 lg:mt-0">
            <Button asChild size="lg">
              <a href={DEMO_BOOKING_URL} data-analytics-location="home_final">
                Book a demo
                <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Link
              href={CONTACT_URL}
              data-analytics-location="home_final"
              className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:underline"
            >
              Prefer to write? Contact the team
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
