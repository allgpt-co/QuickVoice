import { ArrowUpRight } from "lucide-react";
import { DEMO_BOOKING_URL } from "@/lib/links";

export function ContactUsHeroSection() {
  return (
    <section className="page-section border-b border-border bg-muted/40">
      <div className="site-container grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-end">
        <div>
          <p className="eyebrow">Contact QuickVoice</p>
          <h1 className="page-title mt-4">
            Let’s talk about your calling workflow.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Book a demo to explore where a voice agent could fit your business.
            Bring a workflow, a question, or a process you want to improve.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={DEMO_BOOKING_URL}
              data-analytics-location="contact_hero"
              className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              Book a demo
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a
              href="#enquiry"
              className="inline-flex min-h-12 items-center px-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              Send an enquiry
            </a>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Choose an available time on our booking page.
          </p>
        </div>
        <div className="surface-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold">A useful place to start</h2>
          <ul className="mt-4 list-inside list-disc space-y-3 text-sm leading-6 text-muted-foreground">
            <li>The calls your team handles today</li>
            <li>The systems and information involved</li>
            <li>Where a person should stay in control</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
