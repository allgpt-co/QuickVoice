import { Mail, Phone } from "lucide-react";
import { ContactForm } from "@/components/contact-form";

export function ContactUsFormSection() {
  return (
    <section id="enquiry" className="page-section scroll-mt-24">
      <div className="site-container grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <p className="eyebrow">Prefer a message?</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Contact the team.
          </h2>
          <p className="mt-5 max-w-md leading-7 text-muted-foreground">
            Ask about pricing, implementation, or support. Share enough context
            for our team to understand what you need.
          </p>
          <div className="mt-8 space-y-5">
            <a
              href="mailto:info@quickvoice.co"
              className="flex min-h-11 w-fit items-center gap-3 rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <Mail className="h-5 w-5" aria-hidden="true" />
              info@quickvoice.co
            </a>
            <a
              href="tel:+12184525998"
              className="flex min-h-11 w-fit items-center gap-3 rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <Phone className="h-5 w-5" aria-hidden="true" />
              +1 (218) 452-5998
            </a>
          </div>
        </div>
        <div className="surface-card min-w-0 p-5 sm:p-8">
          <ContactForm location="contact_page" />
        </div>
      </div>
    </section>
  );
}
