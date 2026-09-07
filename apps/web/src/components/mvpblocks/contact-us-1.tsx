import { ArrowUpRight } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { DEMO_BOOKING_URL } from "@/lib/links";

export default function ContactUs1() {
  return (
    <section
      id="contact-us"
      className="page-section scroll-mt-24 border-t border-border bg-muted/40"
    >
      <div className="site-container grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <p className="eyebrow">Take the next step</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Explore your first voice workflow.
          </h2>
          <p className="mt-5 max-w-md leading-7 text-muted-foreground">
            Book a demo to discuss your calls, your systems, and what a useful
            first evaluation could look like.
          </p>
          <a
            href={DEMO_BOOKING_URL}
            data-analytics-location="homepage_contact"
            className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            Book a demo
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <p className="mt-8 text-sm leading-6 text-muted-foreground">
            Prefer email?{" "}
            <a
              href="mailto:info@quickvoice.co"
              className="text-primary underline underline-offset-4"
            >
              info@quickvoice.co
            </a>
          </p>
        </div>
        <div className="surface-card min-w-0 p-5 sm:p-8">
          <h3 className="text-xl font-semibold">Or send an enquiry</h3>
          <p className="mb-6 mt-2 text-sm leading-6 text-muted-foreground">
            Ask the team about pricing, implementation, or support.
          </p>
          <ContactForm location="homepage" />
        </div>
      </div>
    </section>
  );
}
