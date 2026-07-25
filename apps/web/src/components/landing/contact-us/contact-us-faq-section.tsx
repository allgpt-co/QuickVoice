"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const faqs = [
  {
    question:
      "What types of voice agents can QuickVoice create for my business?",
    answer:
      "QuickVoice can be adapted for bounded workflows such as support intake, scheduling, reminders, qualification, and routing. The exact behavior depends on the prompts, knowledge, tools, providers, safeguards, and escalation rules you configure.",
  },
  {
    question: "How quickly can I deploy a voice agent for my business?",
    answer:
      "There is no universal production timeline. A local evaluation still needs the documented host prerequisites, while real calls need LiveKit plus Twilio or Telnyx credentials. Production timing depends on integrations, data, testing, security, legal, and operational review.",
  },
  {
    question:
      "Can voice agents integrate with my existing CRM and business systems?",
    answer:
      "QuickVoice includes API, MCP, and custom tool paths that can be adapted for approved external systems. Confirm each target system, authentication method, data contract, side effect, rate limit, and failure path before treating it as an integration.",
  },
  {
    question: "What languages and accents do your voice agents support?",
    answer:
      "Language and voice availability depends on the speech and voice providers configured in your deployment. Test every intended language, accent, terminology set, transfer rule, and fallback path before publishing a support claim.",
  },
  {
    question: "How do you ensure voice agent quality and accuracy?",
    answer:
      "Quality is workflow-specific. Build a representative test set, evaluate tool completion and handoffs, monitor failures, review recordings or transcripts where lawful, and keep high-impact decisions with authorized humans.",
  },
  {
    question: "What security and compliance measures are in place?",
    answer:
      "The repository makes relevant paths inspectable, but it does not establish a certification or compliance status. Review the exact deployment, providers, contracts, access controls, retention, logs, incident response, and operating procedures with qualified owners.",
  },
  {
    question: "How quickly can I get started with QuickVoice?",
    answer:
      "Start with the repository quickstart and prerequisites. The local product surface can be evaluated without live carrier traffic; real calls and production services require provider credentials and deliberate deployment choices.",
  },
  {
    question: "What industries do you serve?",
    answer:
      "The repository contains workflow examples for several industries. Those examples are starting points, not proof of customers, regulatory suitability, or support for every industry requirement.",
  },
  {
    question: "Do I need technical knowledge to use QuickVoice?",
    answer:
      "The console provides configuration interfaces, but self-hosting and production operation still require technical work across Docker, providers, credentials, data, security, integrations, and monitoring.",
  },
  {
    question: "What support do you provide?",
    answer:
      "Use the public repository for issues and contribution guidance. Contact the QuickVoice team to confirm the current scope, response times, and commercial terms for managed implementation or support.",
  },
];

export function ContactUsFaqSection() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  return (
    <section className="py-16 bg-background transition-colors">
      <div className="container mx-auto max-w-6xl px-4 md:px-6">
        {/* Header */}
        <div className="mb-12 flex flex-col items-center">
          <Badge
            variant="outline"
            className="border-primary text-primary mb-4 px-3 py-1 text-xs font-medium tracking-wider uppercase dark:border-primary"
          >
            FAQs
          </Badge>

          <h2 className="text-foreground mb-6 text-center text-4xl font-bold tracking-tight md:text-5xl">
            Frequently Asked Questions
          </h2>

          <p className="text-muted-foreground max-w-2xl text-center">
            Get answers to common questions about QuickVoice and our voice AI
            solutions.
          </p>
        </div>

        {/* FAQ List */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <AnimatePresence>
            {faqs.map((faq, index) => {
              const isOpen = openFaqIndex === index;

              return (
                <motion.div
                  key={faq.question}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={{ scale: 1.02, y: -2 }}
                  className={`border-border h-fit overflow-hidden rounded-xl border transition-all duration-300 ${
                    isOpen
                      ? "shadow-3xl bg-card/50 border-primary/30"
                      : "bg-card/50 hover:border-primary/20"
                  }`}
                  style={{ minHeight: "88px" }}
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="flex w-full items-center justify-between p-6 text-left transition-colors duration-300 hover:bg-card/70"
                  >
                    <h3 className="text-foreground text-lg font-medium">
                      {faq.question}
                    </h3>

                    <div className="ml-4 flex-shrink-0">
                      {isOpen ? (
                        <MinusIcon className="text-primary h-5 w-5" />
                      ) : (
                        <PlusIcon className="text-primary h-5 w-5" />
                      )}
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border px-6 pt-2 pb-6">
                          <p className="text-muted-foreground text-sm leading-relaxed">
                            {faq.answer}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
