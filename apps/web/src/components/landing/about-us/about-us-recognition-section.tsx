"use client";

import { motion } from "framer-motion";
import { Award, Users, TrendingUp } from "lucide-react";

export function AboutUsRecognitionSection() {
  return (
    <section className="relative py-20 bg-background">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="relative mx-auto max-w-2xl sm:text-center mb-16"
        >
          <div className="relative z-10">
            <h2 className="font-geist text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl mb-4">
              Open-Source Project Facts
            </h2>
            <p className="text-lg text-foreground/70 max-w-3xl mx-auto">
              Claims on this page are limited to architecture, license, and
              provider adapters that can be inspected in the repository.
            </p>
          </div>
          <div
            className="absolute inset-0 mx-auto h-44 max-w-xs blur-[118px]"
            style={{
              background:
                "linear-gradient(152.92deg, rgba(var(--primary-rgb), 0.6) 4.54%, rgba(var(--primary-rgb), 0.35) 34.2%, rgba(var(--primary-rgb), 0.95) 77.55%)",
            }}
          ></div>
        </motion.div>
        <hr className="bg-foreground/30 mx-auto mb-12 h-px w-1/2" />

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            whileHover={{ y: -4 }}
            className="group relative transform-gpu space-y-4 rounded-xl border border-border bg-transparent p-8 transition-all duration-200 ease-out hover:border-primary/30 [box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.18)_inset] hover:[box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.25)_inset]"
          >
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-out pointer-events-none"></div>
            <div className="relative z-10 text-center">
              <div className="text-primary w-fit mx-auto transform-gpu rounded-full border p-4 mb-6 transition-all duration-200 ease-out group-hover:scale-110 group-hover:bg-primary/10 [box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.25)_inset] dark:[box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.06)_inset]">
                <Award className="h-6 w-6 text-primary transition-transform duration-200 ease-out group-hover:scale-110" />
              </div>
              <h3 className="font-geist text-xl font-bold tracking-tighter text-foreground mb-4">
                Inspectable Monorepo
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed transition-colors duration-200 ease-out group-hover:text-foreground/80">
                The public repository contains the website, console, API,
                LiveKit-based AI worker, shared configuration, and local
                orchestration.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            whileHover={{ y: -4 }}
            className="group relative transform-gpu space-y-4 rounded-xl border border-border bg-transparent p-8 transition-all duration-200 ease-out hover:border-primary/30 [box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.18)_inset] hover:[box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.25)_inset]"
          >
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-out pointer-events-none"></div>
            <div className="relative z-10 text-center">
              <div className="text-primary w-fit mx-auto transform-gpu rounded-full border p-4 mb-6 transition-all duration-200 ease-out group-hover:scale-110 group-hover:bg-primary/10 [box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.25)_inset] dark:[box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.06)_inset]">
                <Users className="h-6 w-6 text-primary transition-transform duration-200 ease-out group-hover:scale-110" />
              </div>
              <h3 className="font-geist text-xl font-bold tracking-tighter text-foreground mb-4">
                Provider Adapters
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed transition-colors duration-200 ease-out group-hover:text-foreground/80">
                Code paths connect to configurable speech, voice, model,
                telephony, storage, and data providers. An adapter is not a
                partnership claim.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
            whileHover={{ y: -4 }}
            className="group relative transform-gpu space-y-4 rounded-xl border border-border bg-transparent p-8 transition-all duration-200 ease-out hover:border-primary/30 [box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.18)_inset] hover:[box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.25)_inset]"
          >
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-out pointer-events-none"></div>
            <div className="relative z-10 text-center">
              <div className="text-primary w-fit mx-auto transform-gpu rounded-full border p-4 mb-6 transition-all duration-200 ease-out group-hover:scale-110 group-hover:bg-primary/10 [box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.25)_inset] dark:[box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.06)_inset]">
                <TrendingUp className="h-6 w-6 text-primary transition-transform duration-200 ease-out group-hover:scale-110" />
              </div>
              <h3 className="font-geist text-xl font-bold tracking-tighter text-foreground mb-4">
                Shared Responsibility
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed transition-colors duration-200 ease-out group-hover:text-foreground/80">
                The repository exposes privacy-relevant paths, but deployment,
                provider, security, compliance, and operating decisions remain
                the responsibility of each implementation.
              </p>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              value: "AGPL-3.0",
              label: "License",
              description: "Network source-sharing obligations apply",
            },
            {
              value: "4",
              label: "Application Areas",
              description: "Web, console, server, and AI worker",
            },
            {
              value: "2",
              label: "Telephony Paths",
              description: "Twilio and Telnyx adapters in the repo",
            },
            {
              value: "1",
              label: "Local Entry Point",
              description: "task up:dev after host prerequisites",
            },
          ].map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="text-center group"
              whileHover={{ scale: 1.05, y: -4 }}
            >
              <div className="text-3xl font-semibold text-primary mb-2 transition-colors duration-200 ease-out group-hover:text-primary/80">
                {item.value}
              </div>
              <h4 className="font-semibold text-foreground mb-2 transition-colors duration-200 ease-out group-hover:text-primary">
                {item.label}
              </h4>
              <p className="text-sm text-muted-foreground transition-colors duration-200 ease-out group-hover:text-foreground/80">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
