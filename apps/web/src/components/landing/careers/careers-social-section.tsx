"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Linkedin, Twitter, Facebook, Instagram } from "lucide-react";

export function CareersSocialSection() {
  return (
    <section className="py-24 bg-background">
      <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative mx-auto max-w-2xl"
        >
          <div
            className="absolute inset-0 mx-auto h-44 max-w-xs blur-[118px]"

          />
          <h2 className="relative z-10 font-geist text-3xl font-light tracking-tighter text-foreground sm:text-4xl lg:text-5xl mb-6">
            Follow Life at QuickVoice
          </h2>
          <p className="text-lg leading-8 text-muted-foreground mb-8 max-w-2xl mx-auto">
            Stay connected with our team and see what it&apos;s like to work at QuickVoice.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex justify-center space-x-6"
        >
          {[
            { icon: Linkedin, href: "https://www.linkedin.com/company/quickvoiceai" },
            { icon: Twitter, href: "https://x.com/QuickVoice_co" },
            { icon: Facebook, href: "https://www.facebook.com/profile.php?id=61578373598223" },
            { icon: Instagram, href: "https://www.instagram.com/quickvoice_co/" },
          ].map((social, index) => (
            <motion.div
              key={index}
              whileHover={{ scale: 1.1, y: -4 }}
              whileTap={{ scale: 0.95 }}
              className="group relative"
            >
              <div
                className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-out blur-lg -z-10"
                style={{
                  boxShadow: '0 0 30px rgba(var(--primary-rgb), 1), 0 0 50px rgba(var(--primary-rgb), 0.8)',
                }}
              />
              <Link
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="relative flex h-14 w-14 items-center justify-center rounded-full border border-border bg-transparent transition-all duration-200 ease-out hover:border-primary/30 [box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.12)_inset] hover:[box-shadow:0_-20px_80px_-20px_rgba(var(--primary-rgb),0.18)_inset]"
              >
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-out pointer-events-none"></div>
                <social.icon className="h-6 w-6 text-primary relative z-10 transition-colors duration-200 ease-out" />
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

