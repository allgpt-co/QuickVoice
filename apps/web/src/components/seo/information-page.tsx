import type { Metadata } from "next";
import Link from "next/link";

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
  return (
    <main className="bg-background text-foreground">
      <section className="border-b border-border bg-primary/5 px-6 pb-16 pt-32">
        <div className="mx-auto max-w-5xl">
          <p className="font-mono text-sm uppercase tracking-widest text-primary">
            {page.label}
          </p>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
            {page.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
            {page.introduction}
          </p>
        </div>
      </section>
      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-16 md:grid-cols-2">
        {page.sections.map((section) => (
          <section
            key={section.title}
            className="rounded-xl border border-border bg-card p-6"
          >
            <h2 className="text-2xl font-semibold">{section.title}</h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              {section.body}
            </p>
            {section.links && (
              <ul className="mt-5 space-y-3">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="font-medium text-primary underline underline-offset-4"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <section className="border-t border-border px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-semibold">
            Talk through your next step
          </h2>
          <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
            Share your workflow, technical context or project question with the
            QuickVoice team.
          </p>
          <Link
            href="/company/contact"
            className="mt-6 inline-flex rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground"
          >
            Contact QuickVoice
          </Link>
        </div>
      </section>
    </main>
  );
}
