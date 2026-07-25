"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle } from "lucide-react";
import Link from "next/link";

const features = [
  "Smart Lead Qualification",
  "Personalized Recommendations",
  "24/7 Sales Support",
  "Multi-channel Engagement",
  "Enterprise Security",
];

export function SalesLeadGenCtaSection() {
  return (
    <section className="py-20">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 shadow-2xl"
      >
        {/* Background pattern overlay */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-soft-light" />

        <div className="relative p-8 text-white lg:p-16">
          <div className="mb-12 text-center">
            <h2 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Ready to Transform Your Sales Process?
            </h2>
            <p className="mx-auto max-w-3xl text-lg font-light leading-relaxed text-purple-100">
              Inspect the workflow, define consent and escalation rules, and
              measure outcomes against a documented baseline.
            </p>
          </div>

          {/* Features List */}
          <div className="mb-16 flex flex-wrap justify-center gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-center text-white/95 text-lg font-medium"
              >
                <CheckCircle className="mr-2 h-5 w-5 text-white/80" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          {/* CTA Button */}
          <div className="text-center">
            <Link
              href="/company/contact"
              className="group inline-flex items-center rounded-full bg-white px-8 py-4 text-lg font-bold text-primary shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-purple-900/20"
            >
              Contact Us
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
