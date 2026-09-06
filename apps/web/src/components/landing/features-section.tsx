import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { workflowPages } from "@/data/workflow-pages";

export function FeaturesSection() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">
        Choose your first workflow
      </p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        Start with the calls your team knows best
      </h2>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
        Define the questions an agent can answer, the actions it may take, and
        when a person steps in. Explore the requirements before choosing a
        pilot.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Object.values(workflowPages).map((page) => (
          <Link
            key={page.path}
            href={page.path}
            className="group rounded-2xl border border-border bg-card p-7 transition-colors hover:border-primary"
          >
            <h3 className="text-xl font-semibold">{page.label}</h3>
            <p className="mt-4 leading-7 text-muted-foreground">
              {page.description}
            </p>
            <span className="mt-6 inline-flex items-center gap-2 font-medium text-primary">
              Explore the workflow{" "}
              <ArrowRight aria-hidden="true" className="size-4" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
