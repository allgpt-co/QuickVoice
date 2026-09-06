"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";
import { ArrowUpRight, Github } from "lucide-react";
import { DEMO_BOOKING_URL, GITHUB_REPO_URL, REGISTER_URL } from "@/lib/links";

export default function Globe3D() {
  return (
    <section className="relative w-full overflow-hidden pt-32 pb-10 font-light antialiased md:pt-20 md:pb-16">
      <div
        className="absolute top-0 right-0 h-1/2 w-1/2"
        style={{
          background:
            "radial-gradient(circle at 70% 30%, rgba(var(--primary-rgb), 0.15) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute top-0 left-0 h-1/2 w-1/2 -scale-x-100"
        style={{
          background:
            "radial-gradient(circle at 70% 30%, rgba(var(--primary-rgb), 0.15) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 container mx-auto max-w-2xl px-4 text-center md:max-w-4xl md:px-6 lg:max-w-7xl">
        <div>
          <span className="mb-6 mt-10 inline-block rounded-full border px-3 py-1 text-xs border-primary/60 text-primary/80 dark:border-primary/30 dark:text-primary">
            AI PHONE AGENTS FOR BUSINESS
          </span>
          <h1 className="mx-auto mb-6 max-w-4xl text-4xl font-light md:text-5xl lg:text-7xl text-foreground">
            Give your business calls{" "}
            <span className="text-primary">a clear next step</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Explore reception, appointment requests, customer support, and sales
            follow-up with AI phone agents. Run a focused pilot on a
            self-hostable platform your implementation team can inspect.
          </p>

          <div className="mb-10 flex flex-col items-center justify-center gap-4 sm:mb-0 sm:flex-row">
            <Link
              href={DEMO_BOOKING_URL}
              className="relative w-full overflow-hidden rounded-full bg-primary px-8 py-4 text-center font-semibold text-white shadow-lg shadow-[rgba(var(--primary-rgb),0.28)] transition-all duration-300 hover:bg-primary/90 hover:shadow-[0_18px_60px_rgba(var(--primary-rgb),0.35)] sm:w-auto"
            >
              Book a Demo
            </Link>
            <Link
              href={REGISTER_URL}
              className="neumorphic-button relative w-full overflow-hidden rounded-full border px-8 py-4 text-center text-foreground shadow-lg transition-all duration-300 bg-gradient-to-b from-white/80 to-white/60 hover:border-gray-300 hover:shadow-md dark:bg-gradient-to-b dark:from-white/10 dark:to-white/5 dark:border-white/10 dark:hover:border-primary/30 dark:hover:shadow-[0_0_20px_rgba(var(--primary-rgb),0.5)] sm:w-auto"
            >
              Try the Builder
            </Link>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              data-analytics-location="homepage_hero"
              className="relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full border border-primary/40 bg-background/80 px-8 py-4 text-center font-semibold text-primary shadow-sm transition-all duration-300 hover:border-primary hover:bg-primary/5 sm:w-auto"
            >
              <Github aria-hidden="true" className="size-4" />
              Open source on GitHub
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </a>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-sm text-muted-foreground">
          Real calls require provider accounts, configuration, and a technical
          operator. External booking and business systems need tested
          connections.
        </p>
        <motion.div
          className="relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
        >
          <div className="relative flex h-48 w-full overflow-hidden md:h-72">
            <Image
              src="/earth.webp"
              alt="Earth"
              className="absolute top-0 left-1/2 -z-10 mx-auto -translate-x-1/2 px-4 opacity-80"
              width={800}
              height={800}
              sizes="(max-width: 768px) 100vw, 800px"
              loading="eager"
            />
          </div>
          <div className="relative z-10 mx-auto max-w-5xl rounded-2xl shadow-[0_0_50px_rgba(var(--primary-rgb),0.2)]">
            <Image
              src="/dashboard.png"
              alt="QuickVoice Dashboard"
              width={1200}
              height={630}
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1200px"
              className="rounded-2xl border border-white/10"
              priority
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
