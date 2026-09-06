"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Phone, Mail, Building2, Loader2, Check } from "lucide-react";
import { trackContactLead } from "@/lib/analytics";

const contactInfo = {
  email: "info@quickvoice.co",
  phone: "+1 2184525998",
  address: "Delaware, United States",
};

export function ContactUsFormSection() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    lookingFor: "",
    message: "",
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = "Full name is required";
    } else if (formData.name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.lookingFor) {
      newErrors.lookingFor = "Please select what you are looking for";
    }

    if (!formData.message.trim()) {
      newErrors.message = "Message is required";
    } else if (formData.message.trim().length < 10) {
      newErrors.message = "Message must be at least 10 characters";
    }

    const phone = formData.phone.trim();
    if (phone && !/^[+]?[1-9][\d\s().-]{3,24}$/.test(phone)) {
      newErrors.phone = "Please enter a valid phone number";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");
    setIsSubmitted(false);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || "Unable to process your request at this time");
      }

      trackContactLead("contact_page");
      // Clear form data
      setFormData({
        name: "",
        email: "",
        company: "",
        phone: "",
        lookingFor: "",
        message: "",
      });

      setIsSubmitted(true);

      // Reset success message after 10 seconds
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setIsSubmitted(false);
      }, 10000);
    } catch (error: unknown) {
      console.error("Error submitting form:", error);
      const errorMessage = error instanceof Error
        ? error.message
        : "We encountered an issue processing your request. Please try again or contact us directly at info@quickvoice.co or +1 218-452-5998.";
      setSubmitError(errorMessage);

      // Clear error message after 10 seconds
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => {
        setSubmitError("");
      }, 10000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="overflow-hidden bg-background px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">
          {/* Form */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-3xl border border-border bg-card/95 p-8 shadow-xl shadow-primary/10 backdrop-blur-md"
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-accent/30 blur-2xl" />

            <div className="relative z-10 space-y-2">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
                Let&apos;s Start Your Journey
              </h2>
              <p className="text-sm text-muted-foreground sm:text-base">
                Tell us about your workflow so our team can help you evaluate
                the requirements and next steps.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="relative z-10 mt-8 space-y-6" noValidate>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="name"
                    className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Full Name *
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? "name-error" : undefined}
                    className={`w-full rounded-xl border bg-card px-4 py-3 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/80 focus:ring-2 focus:ring-primary/20 ${
                      errors.name
                        ? "border-red-500 focus:border-red-500"
                        : "border-border focus:border-primary"
                    }`}
                    placeholder="Enter your full name"
                  />
                  {errors.name && (
                    <p id="name-error" className="mt-1 text-xs text-red-500">
                      {errors.name}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Email Address *
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    className={`w-full rounded-xl border bg-card px-4 py-3 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/80 focus:ring-2 focus:ring-primary/20 ${
                      errors.email
                        ? "border-red-500 focus:border-red-500"
                        : "border-border focus:border-primary"
                    }`}
                    placeholder="Enter your email address"
                  />
                  {errors.email && (
                    <p id="email-error" className="mt-1 text-xs text-red-500">
                      {errors.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="company"
                    className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Company / Organization
                  </label>
                  <input
                    id="company"
                    name="company"
                    type="text"
                    value={formData.company}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/80 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Enter your company name"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="phone"
                    className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleInputChange}
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? "phone-error" : undefined}
                    className={`w-full rounded-xl border bg-card px-4 py-3 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/80 focus:ring-2 focus:ring-primary/20 ${
                      errors.phone
                        ? "border-red-500 focus:border-red-500"
                        : "border-border focus:border-primary"
                    }`}
                    placeholder="Enter your phone number"
                  />
                  {errors.phone && (
                    <p id="phone-error" className="mt-1 text-xs text-red-500">
                      {errors.phone}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="lookingFor"
                  className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  What are you looking for? *
                </label>
                <select
                  id="lookingFor"
                  name="lookingFor"
                  value={formData.lookingFor}
                  onChange={handleInputChange}
                  required
                  aria-invalid={Boolean(errors.lookingFor)}
                  aria-describedby={errors.lookingFor ? "lookingFor-error" : undefined}
                  className={`w-full rounded-xl border bg-card px-4 py-3 text-sm text-foreground outline-none transition-all duration-200 focus:ring-2 focus:ring-primary/20 ${
                    errors.lookingFor
                      ? "border-red-500 focus:border-red-500"
                      : "border-border focus:border-primary"
                  }`}
                >
                  <option value="">Select an option</option>
                  <option value="Free Demo">Free Demo</option>
                  <option value="Consultation">Consultation</option>
                  <option value="Implementation">Implementation</option>
                  <option value="Support">Support</option>
                  <option value="General Inquiry">General Inquiry</option>
                </select>
                {errors.lookingFor && (
                  <p id="lookingFor-error" className="mt-1 text-xs text-red-500">
                    {errors.lookingFor}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="message"
                  className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  How can we help you? *
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={5}
                  value={formData.message}
                  onChange={handleInputChange}
                  required
                  aria-invalid={Boolean(errors.message)}
                  aria-describedby={errors.message ? "message-error" : undefined}
                  className={`w-full resize-none rounded-xl border bg-card px-4 py-3 text-sm text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground/80 focus:ring-2 focus:ring-primary/20 ${
                    errors.message
                      ? "border-red-500 focus:border-red-500"
                      : "border-border focus:border-primary"
                  }`}
                  placeholder="Please describe your needs, challenges, or questions..."
                />
                {errors.message && (
                  <p id="message-error" className="mt-1 text-xs text-red-500">
                    {errors.message}
                  </p>
                )}
              </div>

              <div aria-live="polite" aria-atomic="true">
                {submitError && (
                  <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
                    {submitError}
                  </div>
                )}

                {isSubmitted && (
                  <div role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400">
                    Thank you. Your inquiry was delivered to the QuickVoice team.
                  </div>
                )}
              </div>

              <div className="flex justify-center pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group relative inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : isSubmitted ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Message Sent!</span>
                    </>
                  ) : (
                    <>
                      <span>Send Message</span>
                      <svg
                        className="h-5 w-5 transform transition-transform duration-200 group-hover:translate-x-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>

          {/* Contact options */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="space-y-8"
          >
            <div className="text-center lg:text-left">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
                Get in Touch
              </h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                We&apos;re here to help you succeed with voice AI. Choose the best way to reach
                us.
              </p>
            </div>

            <div className="space-y-5">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform duration-200 group-hover:scale-105 group-hover:shadow-primary/40">
                    <Phone className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Call Us
                    </h3>
                    <p className="mt-1 text-sm font-medium text-primary">
                      {contactInfo.phone}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Discuss your calling workflow with our team.
                    </p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform duration-200 group-hover:scale-105 group-hover:shadow-primary/40">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Email Us
                    </h3>
                    <p className="mt-1 text-sm font-medium text-primary">
                      {contactInfo.email}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Contact our team about your requirements.
                    </p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform duration-200 group-hover:scale-105 group-hover:shadow-primary/40">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Visit Us
                    </h3>
                    <p className="mt-1 text-sm font-medium text-primary">
                      {contactInfo.address}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      United States • Global presence
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
