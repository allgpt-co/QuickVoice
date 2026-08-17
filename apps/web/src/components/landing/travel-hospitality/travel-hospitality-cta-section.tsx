"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { REGISTER_URL } from "@/lib/links";

export function TravelHospitalityCtaSection() {
  return (
    <div className="flex items-center w-full justify-center px-6 py-16">
      <motion.div
        className="relative w-full max-w-4xl overflow-hidden rounded-[40px] bg-primary p-6 sm:p-10 md:p-20 transition-all duration-300 hover:shadow-2xl"
        whileHover={{ scale: 1.01 }}
      >
        <div className="absolute inset-0 hidden h-full w-full overflow-hidden md:block">
          <div className="absolute top-1/2 right-[-45%] aspect-square h-[800px] w-[800px] -translate-y-1/2">
            {/* Light mode circles */}
            <div className="absolute inset-0 rounded-full bg-chart-2 opacity-30 dark:hidden"></div>
            <div className="absolute inset-0 scale-[0.8] rounded-full bg-chart-3 opacity-30 dark:hidden"></div>
            <div className="absolute inset-0 scale-[0.6] rounded-full bg-chart-4 opacity-30 dark:hidden"></div>
            <div className="absolute inset-0 scale-[0.4] rounded-full bg-chart-5 opacity-30 dark:hidden"></div>
            <div className="absolute inset-0 scale-[0.2] rounded-full bg-white/50 opacity-30 dark:hidden"></div>
            <div className="absolute inset-0 scale-[0.1] rounded-full bg-white/50 opacity-30 dark:hidden"></div>

            {/* Dark mode circles */}
            <div className="absolute inset-0 rounded-full bg-chart-2 opacity-30 hidden dark:block"></div>
            <div className="absolute inset-0 scale-[0.8] rounded-full bg-chart-3 opacity-30 hidden dark:block"></div>
            <div className="absolute inset-0 scale-[0.6] rounded-full bg-chart-4 opacity-30 hidden dark:block"></div>
            <div className="absolute inset-0 scale-[0.4] rounded-full bg-chart-5 opacity-30 hidden dark:block"></div>
            <div className="absolute inset-0 scale-[0.2] rounded-full bg-white/50 opacity-30 hidden dark:block"></div>
            <div className="absolute inset-0 scale-[0.1] rounded-full bg-white/50 opacity-30 hidden dark:block"></div>
          </div>
        </div>

        <div className="relative z-10">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-3 text-3xl font-bold text-white sm:text-4xl md:mb-4 md:text-5xl"
          >
            Ready to Transform Your Travel & Hospitality Operations?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-6 max-w-md text-base text-white sm:text-lg md:mb-8"
          >
            Evaluate a bounded travel or hospitality call flow with your own
            booking systems, policies, languages, and human handoffs.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col gap-4 sm:flex-row sm:gap-6"
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/company/contact"
                className="group flex w-full items-center justify-between rounded-full border-2 border-white bg-transparent px-6 py-3.5 text-white sm:w-[240px] transition-all duration-300 hover:bg-white/10 hover:shadow-lg"
              >
                <span className="font-semibold">Contact Us</span>
                <ArrowRight className="h-5 w-5 text-white transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href={REGISTER_URL}
                className="group flex w-full items-center justify-between rounded-full border-2 border-white bg-transparent px-6 py-3.5 text-white sm:w-[240px] transition-all duration-300 hover:bg-white/10 hover:shadow-lg"
              >
                <span className="font-semibold">Book a Demo</span>
                <ArrowRight className="h-5 w-5 text-white transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
