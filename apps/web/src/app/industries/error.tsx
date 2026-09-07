"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function IndustriesError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className="page-section">
      <div className="site-container flex min-h-[50vh] flex-col items-start justify-center">
        <p className="eyebrow">Page unavailable</p>
        <h1 ref={heading} tabIndex={-1} className="page-title mt-4 max-w-3xl">
          Unable to load this industry guide
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
          Try loading the page again, or explore the other industry guides.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" type="button" onClick={unstable_retry}>
            Try again
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/industries">All industries</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
