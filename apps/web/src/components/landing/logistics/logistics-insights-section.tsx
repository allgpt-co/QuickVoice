"use client";

import { motion } from "framer-motion";
import { BarChart3, MessageSquare, Zap } from "lucide-react";
import Image from "next/image";

export function LogisticsInsightsSection() {
  const insights = [
    {
      icon: BarChart3,
      title: "Unified Insights Dashboard",
      description: "Consolidate voice and chat transcripts into one place. Gain real-time metrics on CSAT, deflection rates, peak volumes, & more to continuously optimize support.",
      image: "/images/logistics/unified-dashboard.png"
    },
    {
      icon: MessageSquare,
      title: "Seamless Context Continuity",
      description: "Our platform preserves conversation history as customers switch channels. No \"starting over\". Agents pick up where the last interaction left off.",
      image: "/images/logistics/context-continuity.png"
    },
    {
      icon: Zap,
      title: "Effortless Integration into Your Stack",
      description: "Get up and running in days, not months: choose from our pre-built connectors for Salesforce, Zendesk, Shopify, and more; embed our Web & Mobile SDKs with a few lines of code; or leverage flexible REST APIs and webhooks to wire QuickVoice into any custom workflow.",
      image: "/images/logistics/integration-stack.png"
    }
  ];

  return (
    <section className="relative py-20 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="relative mx-auto max-w-2xl sm:text-center mb-16"
        >
          <div className="relative z-10">
            <h2 className="font-geist text-3xl font-normal tracking-tighter text-foreground sm:text-4xl md:text-5xl mb-4">
              Advanced Analytics & Integration
            </h2>
            <p className="font-geist text-muted-foreground mt-3 max-w-3xl mx-auto">
              Gain powerful insights and seamlessly integrate with your existing logistics technology stack
            </p>
          </div>
          <div
            className="absolute inset-0 mx-auto h-44 max-w-xs blur-[118px]"
            style={{
              background:
                "linear-gradient(152.92deg, rgba(var(--primary-rgb), 0.6) 4.54%, rgba(var(--primary-rgb), 0.35) 34.2%, rgba(var(--primary-rgb), 0.95) 77.55%)",
            }}></div>
        </motion.div>
        <hr className="bg-foreground/30 mx-auto mb-12 h-px w-1/2" />

        <div className="space-y-24">
          {insights.map((insight, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              className={`group grid grid-cols-1 lg:grid-cols-2 gap-12 items-center rounded-3xl p-8 transition-all duration-300 ease-out border border-transparent hover:border-primary/20 hover:bg-gradient-to-br hover:from-primary/5 hover:via-transparent hover:to-primary/5 hover:shadow-xl hover:shadow-primary/10 ${
                index % 2 === 1 ? 'lg:grid-flow-col-dense' : ''
              }`}
            >
              <div className={`${index % 2 === 1 ? 'lg:col-start-2' : ''}`}>
                <div className="flex items-center mb-6">
                  <div className="text-primary w-fit transform-gpu rounded-full border p-4 mr-4 transition-all duration-300 ease-out group-hover:scale-110 group-hover:bg-primary/10 [box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.25)_inset] dark:[box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.06)_inset]">
                    <insight.icon className="h-6 w-6 text-primary transition-transform duration-300 ease-out group-hover:scale-110" />
                  </div>
                  <h3 className="font-geist text-2xl font-bold tracking-tighter text-foreground transition-colors duration-300 ease-out group-hover:text-primary">
                    {insight.title}
                  </h3>
                </div>

                <p className="text-muted-foreground text-lg leading-relaxed transition-colors duration-300 ease-out group-hover:text-foreground/90">
                  {insight.description}
                </p>
              </div>

              <div className={`${index % 2 === 1 ? 'lg:col-start-1' : ''}`}>
                <div className="relative group">
                  <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl shadow-2xl group-hover:shadow-primary/20 transition-shadow duration-300">
                    <Image
                      src={insight.image}
                      alt={`${insight.title} illustration`}
                      width={600}
                      height={400}
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                      onError={() => {
                        console.error('Image failed to load:', insight.image);
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
