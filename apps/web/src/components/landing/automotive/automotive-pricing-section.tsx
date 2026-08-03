"use client";

import { motion } from "framer-motion";
import { Bot, Clock3, CreditCard, Phone } from "lucide-react";
import Link from "next/link";

import { CONTACT_URL, DEMO_BOOKING_URL, REGISTER_URL } from "@/lib/links";

const COSTS = [
  {
    icon: Bot,
    name: "AI models",
    price: "Market cost + 20%",
    description: "Measured STT, TTS, and LLM usage for each dealership agent.",
  },
  {
    icon: Phone,
    name: "Telephony",
    price: "Provider cost + 20%",
    description: "Carrier charges vary by call direction, country, and destination.",
  },
  {
    icon: Clock3,
    name: "Platform",
    price: "$0.01 / connected min",
    description: "Prorated per second, with no bundled-minute commitment.",
  },
  {
    icon: CreditCard,
    name: "Phone numbers",
    price: "From $2 / 30 days",
    description: "Renewed from paid wallet credit; promotional credit is for calls only.",
  },
] as const;

export function AutomotivePricingSection() {
  return (
    <section className="bg-gray-50 py-20 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="mb-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-white"
          >
            Usage-based dealership pricing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="mx-auto max-w-3xl text-lg text-gray-600 dark:text-gray-300"
          >
            Start with $5 in promotional call credit, then fund one prepaid wallet
            for measured AI, carrier, and connected-time usage.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {COSTS.map((cost, index) => (
            <motion.article
              key={cost.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="rounded-xl bg-white p-7 shadow-lg dark:bg-gray-800"
            >
              <cost.icon className="size-5 text-primary" />
              <h3 className="mt-5 text-lg font-bold text-gray-900 dark:text-white">
                {cost.name}
              </h3>
              <p className="mt-2 text-xl font-bold text-primary">{cost.price}</p>
              <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                {cost.description}
              </p>
            </motion.article>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          viewport={{ once: true }}
          className="mx-auto mt-14 max-w-4xl rounded-xl bg-white p-8 text-center shadow-lg dark:bg-gray-800"
        >
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Estimate your dealership workflow
          </h3>
          <p className="mt-3 text-gray-600 dark:text-gray-300">
            Model choice, call destinations, average duration, and number inventory
            determine spend. We can map those inputs before a larger rollout.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href={REGISTER_URL}
              className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105"
            >
              Start with $5 credit
            </Link>
            <Link
              href={DEMO_BOOKING_URL}
              className="inline-flex items-center justify-center rounded-full border-2 border-primary px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              Schedule demo
            </Link>
            <Link
              href={CONTACT_URL}
              className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-primary hover:underline"
            >
              Contact sales
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
