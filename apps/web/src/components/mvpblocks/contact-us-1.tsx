'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import Earth from '@/components/ui/globe';
import { SparklesCore } from '@/components/ui/sparkles';
import { Label } from '@/components/ui/label';
import { Check, Loader2 } from 'lucide-react';
import { trackContactLead } from '@/lib/analytics';

type ContactField = 'name' | 'email' | 'message';
type ContactErrors = Partial<Record<ContactField, string>>;

export default function ContactUs1() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<ContactErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formRef = useRef(null);
  const isInView = useInView(formRef, { once: true, amount: 0.3 });

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  const clearFieldError = (field: ContactField) => {
    setErrors((current) =>
      current[field] ? { ...current, [field]: undefined } : current,
    );
  };

  const validateForm = () => {
    const nextErrors: ContactErrors = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName) {
      nextErrors.name = 'Name is required';
    } else if (trimmedName.length < 2) {
      nextErrors.name = 'Name must be at least 2 characters';
    }

    if (!trimmedEmail) {
      nextErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Please enter a valid email address';
    }

    if (!trimmedMessage) {
      nextErrors.message = 'Message is required';
    } else if (trimmedMessage.length < 10) {
      nextErrors.message = 'Message must be at least 10 characters';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError('');
    setIsSubmitted(false);
    setSuccessMessage('');

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          company: '',
          phone: '',
          lookingFor: 'General Inquiry',
          message,
        }),
      });
      const data = await response.json();

      if (!response.ok || data.ok !== true) {
        throw new Error(data.error || 'Unable to process your request at this time');
      }

      trackContactLead('homepage');
      setName('');
      setEmail('');
      setMessage('');
      setErrors({});
      setIsSubmitted(true);
      setSuccessMessage(
        data.message || 'Thank you. Your inquiry was delivered to the QuickVoice team.',
      );

      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setIsSubmitted(false);
        setSuccessMessage('');
      }, 10000);
    } catch (error: unknown) {
      console.error('Error submitting form:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'We encountered an issue processing your request. Please try again or contact us directly at info@quickvoice.co.';
      setSubmitError(errorMessage);

      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => {
        setSubmitError('');
      }, 10000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="contact-us" className="relative w-full overflow-hidden py-20 md:py-28">
      {/* Light mode glows */}
      <div
        className="absolute top-0 left-0 h-[500px] w-[500px] rounded-full opacity-20 blur-[120px] dark:hidden"
        style={{
          background: `radial-gradient(circle at center, #2563eb, transparent 70%)`,
        }}
      />
      <div
        className="absolute right-0 bottom-0 h-[300px] w-[300px] rounded-full opacity-10 blur-[100px] dark:hidden"
        style={{
          background: `radial-gradient(circle at center, #2563eb, transparent 70%)`,
        }}
      />

      {/* Dark mode glows */}
      <div
        className="absolute top-0 left-0 h-[500px] w-[500px] rounded-full opacity-20 blur-[120px] hidden dark:block"
        style={{
          background: `radial-gradient(circle at center, #8b5cf6, transparent 70%)`,
        }}
      />
      <div
        className="absolute right-0 bottom-0 h-[300px] w-[300px] rounded-full opacity-10 blur-[100px] hidden dark:block"
        style={{
          background: `radial-gradient(circle at center, #8b5cf6, transparent 70%)`,
        }}
      />

      <div className="relative z-10 container mx-auto px-4 md:px-6">
        <div className="border-border/40 bg-secondary/20 mx-auto max-w-5xl overflow-hidden rounded-[28px] border shadow-xl backdrop-blur-sm">
          <div className="grid md:grid-cols-2">
            <div className="relative p-6 md:p-10" ref={formRef}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="relative"
              >
                <h2 className="from-foreground to-foreground/80 mb-2 bg-gradient-to-r bg-clip-text text-4xl font-bold tracking-tight text-transparent md:text-5xl">
                  Contact <span className="text-primary">Us</span>
                </h2>
                <SparklesCore
                  id="tsparticles"
                  background="transparent"
                  minSize={0.6}
                  maxSize={1.4}
                  particleDensity={80}
                  className="absolute inset-0 top-0 h-24 w-full pointer-events-none"
                  particleColor="#2563eb"
                />
              </motion.div>

              <motion.form
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                onSubmit={handleSubmit}
                className="mt-8 space-y-6"
                noValidate
              >
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <motion.div
                    className="space-y-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        clearFieldError('name');
                      }}
                      placeholder="Enter your name"
                      required
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={
                        errors.name ? 'homepage-contact-name-error' : undefined
                      }
                    />
                    {errors.name && (
                      <p
                        id="homepage-contact-name-error"
                        className="text-sm text-red-600 dark:text-red-400"
                      >
                        {errors.name}
                      </p>
                    )}
                  </motion.div>

                  <motion.div
                    className="space-y-2"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError('email');
                      }}
                      placeholder="Enter your email"
                      required
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={
                        errors.email ? 'homepage-contact-email-error' : undefined
                      }
                    />
                    {errors.email && (
                      <p
                        id="homepage-contact-email-error"
                        className="text-sm text-red-600 dark:text-red-400"
                      >
                        {errors.email}
                      </p>
                    )}
                  </motion.div>
                </div>

                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      clearFieldError('message');
                    }}
                    placeholder="Enter your message"
                    required
                    aria-invalid={Boolean(errors.message)}
                    aria-describedby={
                      errors.message ? 'homepage-contact-message-error' : undefined
                    }
                    className="h-40 resize-none"
                  />
                  {errors.message && (
                    <p
                      id="homepage-contact-message-error"
                      className="text-sm text-red-600 dark:text-red-400"
                    >
                      {errors.message}
                    </p>
                  )}
                </motion.div>

                <div aria-live="polite" aria-atomic="true">
                  {submitError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      role="alert"
                      className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400"
                    >
                      {submitError}
                    </motion.div>
                  )}

                  {isSubmitted && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      role="status"
                      className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400"
                    >
                      {successMessage}
                    </motion.div>
                  )}
                </div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full"
                >
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-gradient-to-b from-blue-600 to-blue-800 text-white shadow-[0px_2px_0px_0px_rgba(255,255,255,0.3)_inset] dark:from-purple-500 dark:to-purple-700"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </span>
                    ) : isSubmitted ? (
                      <span className="flex items-center justify-center">
                        <Check className="mr-2 h-4 w-4" />
                        Message Sent!
                      </span>
                    ) : (
                      <span>Send Message</span>
                    )}
                  </Button>
                </motion.div>
              </motion.form>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="relative my-8 flex items-center justify-center overflow-hidden px-2"
            >
              <div className="flex flex-col items-center justify-center overflow-hidden">
                <article className="relative mx-auto h-[350px] min-h-60 max-w-[450px] overflow-hidden rounded-3xl border bg-gradient-to-b from-blue-600 to-blue-100/10 p-6 text-3xl tracking-tight text-white dark:from-purple-500 dark:to-purple-100/10 md:h-[450px] md:min-h-80 md:p-8 md:text-4xl md:leading-[1.05] lg:text-5xl">
                  Cutting-edge technology to transform your business
                  <div className="absolute -right-20 -bottom-20 z-10 mx-auto flex h-full w-full max-w-[300px] items-center justify-center transition-all duration-700 hover:scale-105 md:-right-28 md:-bottom-28 md:max-w-[550px]">
                    <Earth
                      scale={1.1}
                      baseColor={[0.15, 0.4, 0.9]} // Blue base
                      markerColor={[0, 0, 0]}
                      glowColor={[0.6, 0.3, 1]} 
                    />
                  </div>
                </article>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
