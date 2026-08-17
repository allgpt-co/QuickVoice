import type { Metadata } from "next";
import { DEMO_BOOKING_URL, REGISTER_URL } from "@/lib/links";
import Link from "next/link";
import {
  Phone,
  CalendarCheck,
  ArrowRightLeft,
  Globe,
  ShieldCheck,
  RefreshCw,
  Settings,
  Plug,
  Rocket,
  Clock,
  Building2,
  Stethoscope,
  Scale,
  SmilePlus,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Metadata                                                           */
/* ------------------------------------------------------------------ */

export const metadata: Metadata = {
  title: "AI Receptionist — 24/7 Automated Call Answering",
  description:
    "Explore a configurable AI receptionist workflow for answering, scheduling, routing, and escalation on open-source phone-agent infrastructure.",
  alternates: {
    canonical: "https://quickvoice.co/solutions/ai-receptionist",
  },
  openGraph: {
    title: "AI Receptionist — 24/7 Automated Call Answering",
    description:
      "Explore a configurable AI receptionist workflow for answering, scheduling, routing, and escalation.",
    url: "https://quickvoice.co/solutions/ai-receptionist",
    siteName: "QuickVoice",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "QuickVoice AI Receptionist — 24/7 Automated Call Answering",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Receptionist — 24/7 Automated Call Answering",
    description:
      "Explore a configurable AI receptionist workflow for answering, scheduling, routing, and escalation.",
    images: ["/og-image.png"],
  },
};

/* ------------------------------------------------------------------ */
/*  Static data                                                        */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    step: "1",
    title: "Configure",
    description:
      "Set a greeting, business hours, routing rules, and knowledge sources in the configuration dashboard.",
    icon: Settings,
  },
  {
    step: "2",
    title: "Connect",
    description:
      "Configure LiveKit plus Twilio or Telnyx, then connect approved calendars, CRMs, or helpdesks through their APIs or tool interfaces.",
    icon: Plug,
  },
  {
    step: "3",
    title: "Go Live",
    description:
      "Test identity checks, tools, transfers, consent, retention, and failure paths before enabling a production phone number.",
    icon: Rocket,
  },
];

const FEATURES = [
  {
    title: "24/7 Call Answering",
    description:
      "Never miss a call again. Your AI receptionist picks up on the first ring, day or night, weekends and holidays included.",
    icon: Clock,
  },
  {
    title: "Appointment Scheduling",
    description:
      "Callers can book, reschedule, or cancel appointments in real time. The AI syncs with Google Calendar, Calendly, and more.",
    icon: CalendarCheck,
  },
  {
    title: "Intelligent Call Routing",
    description:
      "Route callers to the right department or team member based on intent, priority, or custom rules you define.",
    icon: ArrowRightLeft,
  },
  {
    title: "Multi-Language Support",
    description:
      "Configure languages supported by the speech and voice providers in your deployment, then test each language and fallback path.",
    icon: Globe,
  },
  {
    title: "Compliance Review",
    description:
      "Inspect redaction, retention, access, logs, secrets, and provider boundaries; compliance still depends on the complete deployment and operating controls.",
    icon: ShieldCheck,
  },
  {
    title: "External Tools",
    description:
      "Attach allowlisted MCP or HTTP tools to approved workflows and keep side-effect actions behind explicit safeguards.",
    icon: RefreshCw,
  },
];

const USE_CASES = [
  {
    industry: "Healthcare",
    description:
      "Evaluate intake, scheduling, reminder, and escalation workflows only after the exact deployment passes healthcare security, privacy, legal, and operational review.",
    icon: Stethoscope,
  },
  {
    industry: "Real Estate",
    description:
      "Capture buyer and seller leads 24/7, schedule property showings, and qualify prospects before they reach your agents.",
    icon: Building2,
  },
  {
    industry: "Legal",
    description:
      "Screen potential clients, collect case details, schedule consultations, and ensure no prospective client call goes unanswered.",
    icon: Scale,
  },
  {
    industry: "Dental",
    description:
      "Book hygiene appointments, handle insurance verification questions, and send automated appointment confirmations and reminders.",
    icon: SmilePlus,
  },
];

const ROI_STATS = [
  {
    stat: "62%",
    label: "of calls go unanswered after hours",
    description:
      "Every missed call is a missed opportunity. An AI receptionist ensures zero calls go to voicemail.",
  },
  {
    stat: "80%",
    label: "of routine calls handled by AI",
    description:
      "Free your team to focus on high-value work while the AI handles FAQs, scheduling, and routing.",
  },
  {
    stat: "$3K+",
    label: "average monthly savings",
    description:
      "Eliminate the cost of full-time receptionists, overtime pay, and outsourced answering services.",
  },
];

const COMPARISON_ROWS = [
  {
    feature: "Monthly Cost",
    ai: "From $49/mo",
    traditional: "$800 - $2,500/mo",
  },
  {
    feature: "Availability",
    ai: "24/7/365",
    traditional: "Business hours only",
  },
  {
    feature: "Languages",
    ai: "100+",
    traditional: "1 - 2",
  },
  {
    feature: "Scalability",
    ai: "Unlimited concurrent calls",
    traditional: "Limited by headcount",
  },
  {
    feature: "Setup Time",
    ai: "Minutes",
    traditional: "Days to weeks",
  },
  {
    feature: "Appointment Booking",
    ai: "Automated, real-time",
    traditional: "Manual, error-prone",
  },
  {
    feature: "CRM Integration",
    ai: "Native, automatic",
    traditional: "Manual data entry",
  },
  {
    feature: "Call Transcripts",
    ai: "Every call, searchable",
    traditional: "Rarely available",
  },
];

const FAQS = [
  {
    q: "What is an AI receptionist?",
    a: "An AI receptionist is a voice-powered virtual agent that answers phone calls on behalf of your business. It greets callers, answers frequently asked questions, schedules appointments, routes calls, and captures lead information — all without human intervention.",
  },
  {
    q: "How does the AI receptionist handle complex or unexpected questions?",
    a: "The AI is trained on your custom knowledge base and can answer a wide range of questions. When it encounters a request beyond its scope, it seamlessly transfers the call to a human team member or takes a message for follow-up.",
  },
  {
    q: "Can I customize the greeting and voice?",
    a: "Yes. You can fully customize the greeting script, hold music, voice tone, speaking pace, and language. The AI adapts to your brand personality so callers experience a consistent, professional interaction.",
  },
  {
    q: "Is my deployment automatically secure or HIPAA compliant?",
    a: "No. The repository and a plan selection do not establish compliance. Review the exact deployment, providers, contracts, access controls, retention, redaction, logs, incident response, and operating procedures before processing regulated data.",
  },
  {
    q: "How long does it take to set up?",
    a: "You can inspect the local product surface after installing the documented prerequisites. Real calls require LiveKit plus Twilio or Telnyx credentials, and production readiness depends on your integrations, testing, safeguards, and deployment choices.",
  },
  {
    q: "Can the AI receptionist handle multiple calls at the same time?",
    a: "The architecture can run concurrent calls, but actual capacity depends on your LiveKit, telephony, model, speech, infrastructure, rate-limit, and cost configuration. Load-test the intended deployment before publishing a capacity claim.",
  },
];

/* ------------------------------------------------------------------ */
/*  JSON-LD Schemas                                                    */
/* ------------------------------------------------------------------ */

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.a,
    },
  })),
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://quickvoice.co",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Solutions",
      item: "https://quickvoice.co/solutions",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "AI Receptionist",
      item: "https://quickvoice.co/solutions/ai-receptionist",
    },
  ],
};

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "QuickVoice AI Receptionist",
  description:
    "Deploy an AI receptionist that answers calls 24/7, books appointments, and routes callers automatically.",
  url: "https://quickvoice.co/solutions/ai-receptionist",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free trial available",
  },
  featureList: [
    "24/7 automated call answering",
    "Appointment scheduling",
    "Intelligent call routing",
    "100+ language support",
    "HIPAA compliance",
    "CRM integration",
  ],
};

/* ================================================================== */
/*  Page Component                                                     */
/* ================================================================== */

export default function AIReceptionistPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ── JSON-LD ─────────────────────────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
      />

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-20 text-center">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-[10%] left-1/2 h-[40%] w-[60%] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-[10%] -right-[10%] h-[40%] w-[40%] rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="container mx-auto max-w-4xl px-4">
          <nav
            aria-label="Breadcrumb"
            className="mb-8 flex items-center justify-center gap-1 text-sm text-muted-foreground"
          >
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span>Solutions</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">AI Receptionist</span>
          </nav>

          <p className="mb-4 inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1 text-sm font-medium text-primary">
            AI Receptionist
          </p>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            AI Receptionist — Automate{" "}
            <span className="text-primary">Front Desk Calls 24/7</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Replace voicemail with an AI-powered virtual receptionist that
            answers every call, books appointments, routes inquiries, and
            captures structured outcomes, subject to the providers, languages,
            credentials, safeguards, and capacity you configure.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href={DEMO_BOOKING_URL}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90"
            >
              Book a Demo
            </Link>
            <Link
              href={REGISTER_URL}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-8 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Try the Builder
            </Link>
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/30 py-20">
        <div className="container mx-auto max-w-5xl px-4">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
            How It Works
          </h2>
          <p className="mx-auto mb-14 max-w-xl text-center text-muted-foreground">
            Get your AI receptionist live in three simple steps — no coding
            required.
          </p>

          <div className="grid gap-10 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.step} className="text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <step.icon className="h-7 w-7" />
                </div>
                <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {step.step}
                </div>
                <h3 className="mb-2 text-xl font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Key Features ────────────────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
            Key Features
          </h2>
          <p className="mx-auto mb-14 max-w-xl text-center text-muted-foreground">
            Everything you need in a virtual receptionist, powered by
            conversational AI.
          </p>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-border bg-background p-6 transition-shadow hover:shadow-lg"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use Cases by Industry ───────────────────────────────── */}
      <section className="border-t border-border bg-muted/30 py-20">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
            Use Cases by Industry
          </h2>
          <p className="mx-auto mb-14 max-w-xl text-center text-muted-foreground">
            See how businesses across industries use an AI receptionist to
            streamline front-desk operations.
          </p>

          <div className="grid gap-8 sm:grid-cols-2">
            {USE_CASES.map((uc) => (
              <div
                key={uc.industry}
                className="rounded-2xl border border-border bg-background p-6"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <uc.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{uc.industry}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {uc.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROI Stats ───────────────────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto max-w-5xl px-4">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
            The ROI of an AI Receptionist
          </h2>
          <p className="mx-auto mb-14 max-w-xl text-center text-muted-foreground">
            Missing calls means missing revenue. Here is what the numbers say.
          </p>

          <div className="grid gap-8 md:grid-cols-3">
            {ROI_STATS.map((item) => (
              <div
                key={item.stat}
                className="rounded-2xl border border-border bg-background p-8 text-center"
              >
                <p className="text-4xl font-bold text-primary">{item.stat}</p>
                <p className="mt-2 text-sm font-semibold">{item.label}</p>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison Table ────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/30 py-20">
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
            AI Receptionist vs Traditional Answering Service
          </h2>
          <p className="mx-auto mb-14 max-w-xl text-center text-muted-foreground">
            See why businesses are switching from legacy services to AI-powered
            call answering.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b border-border p-4 text-left font-medium text-muted-foreground">
                    Feature
                  </th>
                  <th className="border-b border-primary bg-primary/5 p-4 text-center font-semibold">
                    <div className="flex items-center justify-center gap-2">
                      <Phone className="h-4 w-4 text-primary" />
                      AI Receptionist
                    </div>
                  </th>
                  <th className="border-b border-border p-4 text-center font-semibold">
                    Traditional Service
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.feature}>
                    <td className="p-4 font-medium">{row.feature}</td>
                    <td className="bg-primary/5 p-4 text-center">
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        {row.ai}
                      </span>
                    </td>
                    <td className="p-4 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        {row.traditional}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="container mx-auto max-w-3xl px-4">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="mx-auto mb-12 max-w-xl text-center text-muted-foreground">
            Everything you need to know about QuickVoice&apos;s AI receptionist.
          </p>

          <dl className="divide-y divide-border">
            {FAQS.map((faq) => (
              <div key={faq.q} className="py-6">
                <dt className="text-base font-semibold">{faq.q}</dt>
                <dd className="mt-2 text-muted-foreground">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Bottom CTA ──────────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/30 py-20">
        <div className="container mx-auto max-w-2xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Ready to Never Miss a Call Again?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Deploy your AI receptionist in minutes. Book a demo to map routing,
            scheduling, compliance, and handoff rules before launch.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href={DEMO_BOOKING_URL}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90"
            >
              Book a Demo
            </Link>
            <Link
              href={REGISTER_URL}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-8 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Try the Builder
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
