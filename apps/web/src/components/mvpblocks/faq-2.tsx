"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PlusIcon } from "lucide-react";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: "general" | "pricing" | "technical" | "security" | "integration";
}

const faqItems: FaqItem[] = [
  {
    id: "1",
    question: "What is QuickVoice?",
    answer:
      "QuickVoice is open-source, self-hostable infrastructure for AI phone agents. The repo includes the web app, console, API, LiveKit worker, telephony integration points, knowledge bases, call logs, campaigns, billing paths, and local development tooling.",
    category: "general",
  },
  {
    id: "2",
    question: "Is QuickVoice a Retell alternative?",
    answer:
      "Yes. QuickVoice is positioned as an open-source Retell alternative for teams that want source-level control, self-hosting, privacy review, provider choice, cost visibility, and extensibility instead of only using a closed hosted API.",
    category: "general",
  },
  {
    id: "3",
    question: "How is this different from a hosted voice-agent API?",
    answer:
      "Hosted APIs optimize for managed convenience. QuickVoice exposes the app, API, worker, storage, logs, and telephony boundaries so teams can inspect, self-host, and adapt the stack.",
    category: "technical",
  },
  {
    id: "4",
    question: "Can I run QuickVoice locally?",
    answer:
      "Yes. The README local path is `task up:dev`, which starts the local product surface and services for inspection and development.",
    category: "technical",
  },
  {
    id: "5",
    question: "Can a fresh clone place real phone calls?",
    answer:
      "No. Real calls require LiveKit plus Twilio or Telnyx credentials. OAuth, billing, email, and object storage also require their own provider keys.",
    category: "technical",
  },
  {
    id: "6",
    question: "How does QuickVoice help with privacy review?",
    answer:
      "Because the stack is inspectable, teams can review how call logs, transcripts, recordings, knowledge bases, credentials, and runtime configuration move through the system before production use.",
    category: "security",
  },
  {
    id: "7",
    question: "Does the repository alone prove compliance?",
    answer:
      "No. Compliance depends on deployment, access controls, provider agreements, retention policy, operations, and legal review. The repo makes technical paths inspectable, but it is not a standalone HIPAA, SOC 2, or similar claim.",
    category: "security",
  },
  {
    id: "8",
    question: "How should I think about cost?",
    answer:
      "QuickVoice keeps provider boundaries visible. You can evaluate the costs of LiveKit, telephony, database, object storage, and deployment choices instead of treating the voice-agent stack as one opaque bundle.",
    category: "pricing",
  },
  {
    id: "9",
    question: "Can I customize QuickVoice?",
    answer:
      "Yes. The MIT-licensed repo is designed to be inspected and extended, including agents, knowledge sources, campaigns, permissions, billing paths, provider integrations, and deployment choices.",
    category: "integration",
  },
];

const categories = [
  { id: "all", label: "All" },
  { id: "general", label: "General" },
  { id: "technical", label: "Technical" },
  { id: "pricing", label: "Pricing" },
  { id: "security", label: "Security" },
  { id: "integration", label: "Integration" },
];

export default function Faq2() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredFaqs =
    activeCategory === "all"
      ? faqItems
      : faqItems.filter((item) => item.category === activeCategory);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <section id="faq" className="py-20 md:py-28">
      <div className="container mx-auto max-w-6xl px-4 md:px-6">
        <div className="mb-12 flex flex-col items-center">
          <Badge
            variant="outline"
            className="border-primary mb-4 px-3 py-1 text-xs font-medium tracking-wider uppercase"
          >
            FAQs
          </Badge>

          <h2 className="text-foreground mb-6 text-center text-4xl font-bold tracking-tight md:text-5xl">
            Frequently Asked Questions
          </h2>

          <p className="text-muted-foreground max-w-2xl text-center">
            Find answers to common questions about QuickVoice — from deployment
            and pricing to integrations, security, and compliance.
          </p>
        </div>

        {/* Category Tabs */}
        <div className="mb-10 flex flex-wrap justify-center gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-all",
                activeCategory === category.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              )}
            >
              {category.label}
            </button>
          ))}
        </div>

        {/* FAQ Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <AnimatePresence>
            {filteredFaqs.map((faq, index) => (
              <motion.div
                key={faq.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className={cn(
                  "border-border h-fit overflow-hidden rounded-xl border",
                  expandedId === faq.id
                    ? "shadow-3xl bg-card/50"
                    : "bg-card/50",
                )}
              >
                <button
                  onClick={() => toggleExpand(faq.id)}
                  aria-expanded={expandedId === faq.id}
                  aria-controls={`faq-answer-${faq.id}`}
                  className="flex w-full items-center justify-between p-6 text-left"
                >
                  <h3 className="text-foreground text-lg font-medium">
                    {faq.question}
                  </h3>
                  <div className="ml-4 flex-shrink-0">
                    <PlusIcon
                      className={`text-primary h-5 w-5 transition-transform duration-300 ${expandedId === faq.id ? "rotate-45" : ""}`}
                    />
                  </div>
                </button>

                <AnimatePresence>
                  {expandedId === faq.id && (
                    <motion.div
                      id={`faq-answer-${faq.id}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="border-border border-t px-6 pt-2 pb-6">
                        <p className="text-muted-foreground">{faq.answer}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Contact CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-16 text-center"
        >
          <p className="text-muted-foreground mb-4">
            Can&apos;t find what you&apos;re looking for?
          </p>
          <a
            href="/company/contact"
            className="border-primary text-foreground hover:bg-primary hover:text-white inline-flex items-center justify-center rounded-lg border-2 px-6 py-3 font-medium transition-colors"
          >
            Contact Support
          </a>
        </motion.div>
      </div>
    </section>
  );
}
