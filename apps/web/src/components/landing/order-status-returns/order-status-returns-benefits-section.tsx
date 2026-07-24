"use client";

import { motion } from "framer-motion";
import { REGISTER_URL } from "@/lib/links";
import {
  Users,
  Shield,
  Zap,
  TrendingUp,
  CheckCircle,
  Target,
  Award,
  Activity,
  Clock,
  Globe,
  CheckCircle2,
} from "lucide-react";

const benefits = [
  {
    icon: Users,
    title: "Forward-Deployed Team",
    description:
      "Our team ensures seamless integration into your existing order systems with dedicated support and expertise.",
  },
  {
    icon: Shield,
    title: "AI Guardrails",
    description:
      "Accurate status updates with reduced errors and misinformation through advanced AI safety measures.",
  },
  {
    icon: Zap,
    title: "Sub-500ms Latency",
    description:
      "Check delivery statuses in milliseconds for reduced wait times and instant customer satisfaction.",
  },
  {
    icon: TrendingUp,
    title: "Enhanced Efficiency",
    description:
      "Streamline operations and reduce manual workload with automated order status management.",
  },
  {
    icon: Target,
    title: "Customer Satisfaction",
    description:
      "Deliver exceptional customer experiences with real-time updates and proactive communication.",
  },
  {
    icon: Award,
    title: "Operational Excellence",
    description:
      "Achieve operational excellence with 99.9% uptime and enterprise-grade reliability.",
  },
];

const stats = [
  {
    number: "99.9%",
    label: "Uptime Guarantee",
    description: "Reliable service delivery",
    icon: Activity,
  },
  {
    number: "<500ms",
    label: "Response Time",
    description: "Lightning-fast updates",
    icon: Clock,
  },
  {
    number: "24/7",
    label: "Availability",
    description: "Always-on service",
    icon: Globe,
  },
  {
    number: "100%",
    label: "Compliance",
    description: "Enterprise security standards",
    icon: CheckCircle2,
  },
];

export function OrderStatusReturnsBenefitsSection() {
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
            <h2 className="mb-4 font-geist text-3xl font-normal tracking-tight text-foreground sm:text-4xl md:text-5xl">
              Why QuickVoice?
            </h2>
            <p className="mx-auto max-w-3xl text-lg text-foreground/70">
              By leveraging QuickVoice&apos;s AI voice agents, businesses can
              streamline order status updates and returns, enhancing customer
              satisfaction and operational efficiency across industries.
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

        {/* Benefits Grid */}
        <div className="mb-16 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              whileHover={{ y: -4 }}
              className="group relative transform-gpu flex h-full flex-col overflow-hidden rounded-xl border border-border bg-transparent p-8 transition-all duration-200 ease-out hover:border-primary/30 [box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.18)_inset] hover:[box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.25)_inset]"
            >
              {/* Subtle gradient background on hover */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-out pointer-events-none"></div>

              <div className="relative z-10">
                <div className="text-primary w-fit transform-gpu rounded-full border p-4 mb-6 transition-all duration-200 ease-out group-hover:scale-110 group-hover:bg-primary/10 [box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.25)_inset] dark:[box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.06)_inset]">
                  <benefit.icon className="h-6 w-6 text-primary transition-transform duration-200 ease-out group-hover:scale-110" />
                </div>

                <h3 className="font-geist text-xl font-bold tracking-tighter text-foreground mb-4">
                  {benefit.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed transition-colors duration-200 ease-out group-hover:text-foreground/80">
                  {benefit.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Stats Section - Blue Box Style */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-2xl bg-primary p-8 lg:p-12"
        >
          {/* Decorative elements */}
          <div className="absolute inset-0 hidden h-full w-full overflow-hidden md:block">
            <div className="absolute top-1/2 right-[-45%] aspect-square h-[800px] w-[800px] -translate-y-1/2">
              <div className="absolute inset-0 rounded-full bg-chart-2 opacity-30 dark:hidden"></div>
              <div className="absolute inset-0 scale-[0.8] rounded-full bg-chart-3 opacity-30 dark:hidden"></div>
              <div className="absolute inset-0 scale-[0.6] rounded-full bg-chart-4 opacity-30 dark:hidden"></div>
              <div className="absolute inset-0 rounded-full bg-chart-2 opacity-30 hidden dark:block"></div>
              <div className="absolute inset-0 scale-[0.8] rounded-full bg-chart-3 opacity-30 hidden dark:block"></div>
              <div className="absolute inset-0 scale-[0.6] rounded-full bg-chart-4 opacity-30 hidden dark:block"></div>
            </div>
          </div>

          <div className="relative z-10">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-white mb-4">
                Performance Metrics
              </h3>
              <p className="text-white/80 text-lg leading-relaxed max-w-3xl mx-auto">
                Proven results that drive business success
              </p>
            </div>

            {/* Trust Indicators */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
              className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4"
            >
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="flex flex-col items-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 mb-4">
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                    <div className="text-2xl font-bold text-white mb-2">
                      {stat.number}
                    </div>
                    <div className="text-white/80">{stat.label}</div>
                    <div className="text-sm text-white/70 mt-1">
                      {stat.description}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>
        </motion.div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary via-primary/90 to-primary/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.75)] sm:p-10">
            {/* Grain / glow overlay */}
            <div className="pointer-events-none absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 mix-blend-soft-light" />

            <div className="relative z-10">
              <h3 className="mb-4 text-2xl font-semibold text-white sm:text-3xl">
                Ready to Transform Your Order Management?
              </h3>
              <p className="mx-auto mb-6 max-w-2xl text-lg text-white/90">
                Evaluate order-status and returns workflows against your own
                systems, policies, escalation rules, and test data.
              </p>
              <div className="flex justify-center">
                <a
                  href={REGISTER_URL}
                  className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white px-8 py-4 text-base font-semibold text-primary shadow-lg shadow-[rgba(15,23,42,0.45)] transition-all duration-200 hover:scale-105 hover:shadow-[0_24px_80px_rgba(15,23,42,0.75)] hover:bg-white/90"
                >
                  Book a Free Demo
                  <CheckCircle className="ml-2 h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
