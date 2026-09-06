"use client";

import { motion } from "framer-motion";
import {
  Phone,
  MessageSquare,
  Headphones,
  Sparkles,
  Globe,
  Zap,
  Mail,
} from "lucide-react";

const floatingIcons = [
  { Icon: Phone, delay: 0, x: "10%", y: "20%" },
  { Icon: Mail, delay: 0.2, x: "85%", y: "15%" },
  { Icon: MessageSquare, delay: 0.4, x: "15%", y: "75%" },
  { Icon: Headphones, delay: 0.6, x: "80%", y: "70%" },
  { Icon: Globe, delay: 0.8, x: "5%", y: "50%" },
  { Icon: Zap, delay: 1, x: "90%", y: "55%" },
  { Icon: Phone, delay: 1.2, x: "25%", y: "10%" },
  { Icon: Mail, delay: 1.4, x: "75%", y: "25%" },
  { Icon: MessageSquare, delay: 1.6, x: "20%", y: "85%" },
  { Icon: Headphones, delay: 1.8, x: "70%", y: "80%" },
];

export function ContactUsHeroSection() {
  return (
    <section className="relative w-full overflow-hidden pt-32 pb-12 font-light antialiased md:pt-24 md:pb-12 bg-background flex items-center">
      <div className="absolute inset-0 overflow-hidden">
        {/* Background Gradients - Similar to industries page */}
        <div
          className="absolute -left-8 -top-8 h-96 w-96 blur-[120px] opacity-40"
          style={{
            background:
              "linear-gradient(152.92deg, rgba(var(--primary-rgb), 0.6) 4.54%, rgba(var(--primary-rgb), 0.35) 34.2%, rgba(var(--primary-rgb), 0.95) 77.55%)",
          }}
        />
        <div
          className="absolute -right-8 -bottom-8 h-96 w-96 blur-[120px] opacity-40"
          style={{
            background:
              "linear-gradient(152.92deg, rgba(var(--primary-rgb), 0.6) 4.54%, rgba(var(--primary-rgb), 0.35) 34.2%, rgba(var(--primary-rgb), 0.95) 77.55%)",
          }}
        />

        {/* Floating decorative icons - Contact themed */}
        {floatingIcons.map(({ Icon, delay, x, y }, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.3, 0.5, 0.3, 0],
              scale: [0, 1, 1.2, 1, 0],
              y: [0, -20, -40, -20, 0],
            }}
            transition={{
              duration: 8,
              delay: delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute"
            style={{ left: x, top: y }}
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 backdrop-blur-sm border border-primary/20 flex items-center justify-center">
              <Icon className="w-6 h-6 text-primary/60" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Center content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex justify-center items-center w-full h-full">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center space-y-10 max-w-6xl mx-auto"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex justify-center mb-6"
          >
            <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-blue-800 p-4 shadow-lg shadow-primary/20">
              <Phone className="w-10 h-10 text-primary-foreground" />
            </div>
          </motion.div>

          <div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-4 text-3xl font-light tracking-tighter text-foreground sm:text-4xl md:text-5xl lg:text-6xl font-geist"
            >
              <span className="block">Transform Your</span>
              <span className="block text-primary">
                Business with AI Voice Agents
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mx-auto max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg md:text-xl"
            >
              Tell us which calls you want to handle, which business systems
              need to connect, and how your team follows up today. We can
              discuss the implementation work and a practical evaluation.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-6"
            >
              <Sparkles className="w-4 h-4 text-primary" />
              <span>Get in touch and transform your business today</span>
            </motion.div>
          </div>

          {/* Stats - Updated styling */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3"
          >
            {[
              { label: "Start with", value: "One workflow" },
              { label: "Plan for", value: "Human follow-up" },
              { label: "Evaluate", value: "Your own calls" },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 + index * 0.1 }}
                whileHover={{ scale: 1.05, y: -4 }}
                className="rounded-2xl border border-border bg-card/80 px-5 py-4 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_40px_rgba(var(--primary-rgb),0.18)]"
              >
                <div className="text-xl font-semibold text-foreground md:text-2xl">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
