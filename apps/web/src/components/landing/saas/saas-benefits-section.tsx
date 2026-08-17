"use client";

import { motion } from "framer-motion";
import {
  BarChart3,
  Shield,
  Zap
} from "lucide-react";
import Image from "next/image";
import saasImages from "@/data/industries/saas-images.json";

export function SaasBenefitsSection() {
  const benefits = [
    {
      icon: BarChart3,
      title: "Advanced Analytics & Insights",
      description: "Get comprehensive analytics on customer interactions, call performance, and conversion rates to optimize your AI voice agents.",
      image: saasImages.analytics.url,
      imageAlt: saasImages.analytics.alt
    },
    {
      icon: Shield,
      title: "Enterprise-Grade Security",
      description: "Built with security-first principles, ensuring your customer data is protected with end-to-end encryption and compliance standards.",
      image: saasImages.security.url,
      imageAlt: saasImages.security.alt
    },
    {
      icon: Zap,
      title: "Lightning-Fast Deployment",
      description: "Deploy your AI voice agents in minutes, not months. Our no-code platform makes it easy to get started immediately.",
      image: saasImages.deployment.url,
      imageAlt: saasImages.deployment.alt
    }
  ];

  const stats = [
    { number: "90%", label: "Reduction in Response Time" },
    { number: "75%", label: "Cost Savings" },
    { number: "24/7", label: "Customer Support" },
    { number: "100+", label: "Languages Supported" }
  ];

  return (
    <section className="relative py-20 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="relative mx-auto max-w-2xl sm:text-center mb-20"
        >
          <div className="relative z-10">
            <h2 className="font-geist text-3xl font-normal tracking-tighter text-foreground sm:text-4xl md:text-5xl mb-4">
              Proven Results with AI Call Software
            </h2>
            <p className="font-geist text-muted-foreground mt-3 max-w-3xl mx-auto mb-12">
              Experience the future of customer engagement with QuickVoice&apos;s AI call software solutions.
              Discover how our Conversational AI can transform your business today.
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-20">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              className="text-center group"
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="text-4xl font-bold text-primary mb-2 transition-colors duration-300 group-hover:text-primary/80">
                {stat.number}
              </div>
              <div className="text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Benefits Grid */}
        <div className="space-y-24">
          {benefits.map((benefit, index) => (
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
                    <benefit.icon className="h-6 w-6 text-primary transition-transform duration-300 ease-out group-hover:scale-110" />
                  </div>
                  <h3 className="font-geist text-2xl font-bold tracking-tighter text-foreground transition-colors duration-300 ease-out group-hover:text-primary">
                    {benefit.title}
                  </h3>
                </div>

                <p className="text-muted-foreground text-lg leading-relaxed transition-colors duration-300 ease-out group-hover:text-foreground/90">
                  {benefit.description}
                </p>
              </div>

              <div className={`${index % 2 === 1 ? 'lg:col-start-1' : ''}`}>
                <div className="relative group">
                  <div className="relative aspect-[3/2] w-full overflow-hidden rounded-xl shadow-2xl group-hover:shadow-primary/20 transition-shadow duration-300">
                    <Image
                      src={benefit.image}
                      alt={benefit.imageAlt || `${benefit.title} illustration`}
                      width={600}
                      height={400}
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                      onError={() => {
                        console.error('Image failed to load:', benefit.image);
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
