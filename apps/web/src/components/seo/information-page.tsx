import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTACT_URL, DEMO_BOOKING_URL } from "@/lib/links";

export type InformationPageContent = {
  path: string;
  label: string;
  title: string;
  description: string;
  introduction: string;
  sections: {
    title: string;
    body: string;
    links?: { href: string; label: string }[];
  }[];
};

export function informationMetadata(page: InformationPageContent): Metadata {
  const title = page.label.includes("QuickVoice")
    ? page.label
    : `${page.label} | QuickVoice`;
  const url = `https://quickvoice.co${page.path}`;
  return {
    title: { absolute: title },
    description: page.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: page.description,
      url,
      type: "website",
      images: ["/og-image.png"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: page.description,
      images: ["/og-image.png"],
    },
  };
}

export function InformationPage({ page }: { page: InformationPageContent }) {
  const isCareers = page.path === "/company/careers";
  const isDirectory = ["/industries", "/solutions", "/use-cases"].includes(
    page.path,
  );
  const location = `information_${page.path.split("/").filter(Boolean).join("_")}`;

  return (
    <div className="bg-background text-foreground">
      <section className="page-section border-b border-border">
        <div className="site-container">
          <p className="eyebrow">{page.label}</p>
          <h1 className="page-title mt-4 max-w-4xl">{page.title}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            {page.introduction}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              {isCareers ? (
                <Link
                  href={CONTACT_URL}
                  data-analytics-location={`${location}_hero`}
                >
                  Send a career enquiry <ArrowRight aria-hidden="true" />
                </Link>
              ) : (
                <a
                  href={DEMO_BOOKING_URL}
                  data-analytics-location={`${location}_hero`}
                >
                  Book a demo <ArrowRight aria-hidden="true" />
                </a>
              )}
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#explore">
                {isDirectory ? "Explore the guides" : "Learn more"}
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section
        id="explore"
        className="page-section"
        aria-label={isDirectory ? "Available workflow guides" : page.label}
      >
        <div
          className={`site-container grid gap-5 md:grid-cols-2 ${page.sections.length > 6 ? "xl:grid-cols-3" : ""}`}
        >
          {page.sections.map((section) => (
            <article
              key={section.title}
              className="surface-card flex flex-col p-6 sm:p-8"
            >
              <h2 className="text-xl font-semibold tracking-tight">
                {section.title}
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                {section.body}
              </p>
              {section.links && (
                <ul className="mt-auto space-y-3 pt-6">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="inline-flex items-center gap-2 text-sm font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-current"
                      >
                        {link.label}
                        {link.href.startsWith("https:") ? (
                          <ArrowUpRight
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                        ) : (
                          <ArrowRight
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="page-section border-t border-border bg-muted/25">
        <div className="site-container grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              {isCareers
                ? "Start a conversation with the team"
                : "Talk through your next step"}
            </h2>
            <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
              {isCareers
                ? "Share your area of interest and relevant work to ask about current opportunities."
                : "Share your workflow, technical context or project question with the QuickVoice team."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {!isCareers && (
              <Button asChild size="lg">
                <a
                  href={DEMO_BOOKING_URL}
                  data-analytics-location={`${location}_footer`}
                >
                  Book a demo <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            )}
            <Button
              asChild
              size="lg"
              variant={isCareers ? "default" : "outline"}
            >
              <Link
                href={CONTACT_URL}
                data-analytics-location={`${location}_footer`}
              >
                {isCareers ? "Send an enquiry" : "Contact QuickVoice"}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
