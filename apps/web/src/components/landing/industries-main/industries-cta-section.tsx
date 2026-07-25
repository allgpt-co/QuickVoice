"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { REGISTER_URL } from "@/lib/links";

export function IndustriesCtaSection() {
  return (
    <section className="py-20 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-12 text-center transition-all duration-300 hover:shadow-[0_0_40px_rgba(var(--primary-rgb),0.4)] hover:shadow-primary/50"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent opacity-50" />

          <div className="relative z-10">
            <motion.div
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 mb-6"
            >
              <Sparkles className="w-8 h-8 text-primary" />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-3xl font-light tracking-tight text-foreground sm:text-4xl mb-4"
            >
              Ready to Transform Your Industry?
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto"
            >
              Start with one reviewable call workflow, make its provider and
              data boundaries explicit, and expand only after it is tested.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link
                href={REGISTER_URL}
                className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-3 font-medium text-white transition-all duration-200 hover:shadow-lg hover:shadow-primary/50"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, var(--primary), #1e40af)",
                }}
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/company/contact"
                className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-3 font-medium text-foreground border border-border hover:border-primary/50 hover:bg-muted transition-all duration-200"
              >
                Contact Sales
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
