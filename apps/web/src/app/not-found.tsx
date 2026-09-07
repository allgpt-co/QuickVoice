import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="page-section">
      <div className="site-container flex min-h-[50vh] flex-col items-start justify-center">
        <p className="eyebrow">404 · Page not found</p>
        <h1 className="page-title mt-4 max-w-3xl">
          Let’s find the right page.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
          This page may have moved, or the address may be incorrect. Return to
          the homepage or explore the resource library.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/">
              Go to the homepage <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/resources">Explore resources</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
