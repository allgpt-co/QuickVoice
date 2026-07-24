"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { REGISTER_URL } from "@/lib/links";
import {
  Zap,
  DollarSign,
  Headphones,
  Globe,
  Settings,
  BarChart3,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    title: "Quick & Easy Setup",
    description:
      "Connect the AI Appointment Setter with your tools quickly and get started right away. The process is user-friendly and requires no technical expertise.",
    icon: Zap,
  },
  {
    title: "Cost-Effective Scaling",
    description:
      "Streamline scheduling without increasing overhead. By automating repetitive tasks, you can manage higher workloads without hiring additional staff.",
    icon: DollarSign,
  },
  {
    title: "Efficient Call Handling",
    description:
      "The AI efficiently handles bookings, cancellations, and reminders, ensuring smoother operations and saving time for your team.",
    icon: Headphones,
  },
  {
    title: "24/7 Availability",
    description:
      "Customers can schedule or adjust appointments at any time. This ensures no opportunity is missed, and customers receive prompt responses to their requests.",
    icon: Globe,
  },
  {
    title: "Customizable & Multilingual",
    description:
      "Easily adjust settings to suit your business needs. The system works with multiple languages and integrates with popular tools, providing a consistent experience for all users.",
    icon: Settings,
  },
  {
    title: "User Friendly Dashboard",
    description:
      "The dashboard allows you to monitor appointment activity, track interactions, and adjust workflows as needed.",
    icon: BarChart3,
  },
];

export function AppointmentSchedulingFeaturesSection() {
  return (
    <section className="relative py-20 bg-background">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="relative mx-auto max-w-2xl sm:text-center mb-16"
        >
          <div className="relative z-10">
            <h2 className="mb-4 font-geist text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl">
              Why Choose QuickVoice&apos;s AI Appointment Setter?
            </h2>
            <p className="mx-auto max-w-3xl text-lg text-foreground/70">
              Transform your appointment management with AI-powered scheduling
              that works around the clock.
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

        {/* Features Grid */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{
                default: { duration: 0.6, delay: index * 0.1 },
                y: { duration: 0.2, ease: "easeOut" },
              }}
              viewport={{ once: true }}
              whileHover={{ y: -4 }}
              className="group relative transform-gpu space-y-4 rounded-xl border border-border bg-transparent p-8 transition-all duration-200 ease-out hover:border-primary/30 [box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.18)_inset] hover:[box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.25)_inset]"
            >
              {/* Subtle gradient background on hover */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-out pointer-events-none"></div>

              <div className="relative z-10">
                <div className="text-primary w-fit transform-gpu rounded-full border p-4 mb-6 transition-all duration-200 ease-out group-hover:scale-110 group-hover:bg-primary/10 [box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.25)_inset] dark:[box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.06)_inset]">
                  <feature.icon className="h-6 w-6 text-primary transition-transform duration-200 ease-out group-hover:scale-110" />
                </div>

                <h3 className="font-geist text-xl font-bold tracking-tighter text-foreground mb-4">
                  {feature.title}
                </h3>

                <p className="text-muted-foreground text-sm leading-relaxed transition-colors duration-200 ease-out group-hover:text-foreground/80">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <div className="rounded-2xl border border-border/70 bg-background/80 dark:bg-background/20 p-8 shadow-2xl backdrop-blur-xl [box-shadow:0_-22px_90px_-24px_rgba(var(--primary-rgb),0.22)_inset] dark:[box-shadow:0_-22px_90px_-24px_rgba(var(--primary-rgb),0.18)_inset]">
            <h3 className="mb-4 text-2xl font-semibold text-foreground">
              Ready to Automate Your Scheduling?
            </h3>
            <p className="mx-auto mb-6 max-w-2xl text-lg text-foreground/70">
              Evaluate the scheduling flow with your own calendar, permissions,
              fallback rules, and test data.
            </p>
            <Link
              href={REGISTER_URL}
              className="inline-flex items-center rounded-full bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground shadow-lg shadow-[rgba(var(--primary-rgb),0.35)] transition-all duration-200 hover:scale-105 hover:shadow-[0_24px_80px_rgba(var(--primary-rgb),0.5)] cursor-pointer"
            >
              Get Started Today
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
