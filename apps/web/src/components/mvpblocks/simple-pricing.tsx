import type { Metadata } from "next";
import Link from "next/link";
import { REGISTER_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Pricing — AI Voice Agent Plans",
  description:
    "QuickVoice pricing starts free. Choose from 6 plans — Free, PAYG, Starter ($49/mo), Growth ($99/mo), Scale ($399/mo), and Enterprise. No hidden fees.",
  alternates: {
    canonical: "https://quickvoice.co/pricing",
  },
  openGraph: {
    title: "Pricing — AI Voice Agent Plans",
    description:
      "QuickVoice pricing starts free. Choose from 6 plans. No hidden fees.",
    type: "website",
    url: "https://quickvoice.co/pricing",
  },
};

/* ------------------------------------------------------------------ */
/*  Static plan data (mirrors data/plans.ts without importing icons)  */
/* ------------------------------------------------------------------ */

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    agents: "1",
    minutes: "15 mins/mo",
    effectiveRate: "—",
    overageRate: "—",
    keyFeatures: [
      "Browser playground only",
      "Non-commercial use",
      "15 test minutes per month",
    ],
    cta: "Get Started",
    ctaHref: REGISTER_URL,
    popular: false,
  },
  {
    name: "PAYG",
    price: "$0",
    period: "+ $0.25/min",
    agents: "1",
    minutes: "Pay as you go",
    effectiveRate: "$0.25/min",
    overageRate: "$0.25/min",
    keyFeatures: [
      "API + webhooks + telephony",
      "Per-second billing",
      "1 workspace",
    ],
    cta: "Get Started",
    ctaHref: REGISTER_URL,
    popular: false,
  },
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    agents: "3",
    minutes: "245 mins/mo",
    effectiveRate: "$0.20/min",
    overageRate: "$0.25/min",
    keyFeatures: ["Basic analytics", "Email support", "Telephony enabled"],
    cta: "Subscribe",
    ctaHref: REGISTER_URL,
    popular: false,
  },
  {
    name: "Growth",
    price: "$99",
    period: "/mo",
    agents: "5",
    minutes: "600 mins/mo",
    effectiveRate: "$0.165/min",
    overageRate: "$0.22/min",
    keyFeatures: [
      "Call transcripts & redaction",
      "SSO (add-on)",
      "Telephony enabled",
    ],
    cta: "Subscribe",
    ctaHref: REGISTER_URL,
    popular: false,
  },
  {
    name: "Scale",
    price: "$399",
    period: "/mo",
    agents: "10",
    minutes: "2,660 mins/mo",
    effectiveRate: "$0.15/min",
    overageRate: "$0.20/min",
    keyFeatures: [
      "Retention configuration",
      "Redaction controls",
      "Priority support",
      "Reserved concurrency",
    ],
    cta: "Subscribe",
    ctaHref: REGISTER_URL,
    popular: true,
  },
  {
    name: "Enterprise",
    price: "$1,500",
    period: "/mo",
    agents: "Custom",
    minutes: "10,000+ mins/mo",
    effectiveRate: "$0.15/min",
    overageRate: "Custom",
    keyFeatures: [
      "Custom commercial terms",
      "Dedicated support",
      "Private networking & SSO/SCIM",
    ],
    cta: "Contact Sales",
    ctaHref: "/company/contact",
    popular: false,
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Feature matrix                                                     */
/* ------------------------------------------------------------------ */

const FEATURE_ROWS: { label: string; plans: boolean[] }[] = [
  { label: "Browser playground", plans: [true, true, true, true, true, true] },
  { label: "API & webhooks", plans: [false, true, true, true, true, true] },
  {
    label: "Telephony (inbound/outbound)",
    plans: [false, true, true, true, true, true],
  },
  { label: "Call transcripts", plans: [false, false, false, true, true, true] },
  { label: "PII redaction", plans: [false, false, false, true, true, true] },
  {
    label: "Analytics dashboard",
    plans: [false, false, true, true, true, true],
  },
  { label: "Email support", plans: [false, false, true, true, true, true] },
  {
    label: "Priority support",
    plans: [false, false, false, false, true, true],
  },
  {
    label: "Retention configuration",
    plans: [false, false, false, false, true, true],
  },
  {
    label: "Reserved concurrency",
    plans: [false, false, false, false, true, true],
  },
  { label: "SSO / SCIM", plans: [false, false, false, false, false, true] },
  { label: "Custom SLA", plans: [false, false, false, false, false, true] },
  {
    label: "Redaction controls",
    plans: [false, false, false, false, true, true],
  },
  {
    label: "Private networking",
    plans: [false, false, false, false, false, true],
  },
  {
    label: "Dedicated account manager",
    plans: [false, false, false, false, false, true],
  },
];

/* ------------------------------------------------------------------ */
/*  FAQs                                                               */
/* ------------------------------------------------------------------ */

const FAQS = [
  {
    q: "Is there really a free plan?",
    a: "Yes. The Free plan gives you 1 agent and 15 browser-only minutes every month at no cost. No credit card is required to sign up.",
  },
  {
    q: "How does the PAYG plan work?",
    a: "PAYG (Pay As You Go) has no monthly fee. You are billed per second at an effective rate of $0.25 per minute for every call your agent handles. Telephony, API, and webhooks are all enabled.",
  },
  {
    q: "What happens if I exceed my included minutes?",
    a: "If you go over the minutes included in your plan, additional usage is billed at the overage rate listed for your tier. For example, Starter overages are $0.25/min while Scale overages are $0.20/min.",
  },
  {
    q: "Can I upgrade or downgrade at any time?",
    a: "Absolutely. You can change plans at any point from your account dashboard. Upgrades take effect immediately, and downgrades apply at the start of your next billing cycle.",
  },
  {
    q: "Do you offer annual billing discounts?",
    a: "Yes. Annual plans receive a discount compared to month-to-month pricing. Contact our sales team for a custom annual quote.",
  },
  {
    q: "Is QuickVoice HIPAA-compliant?",
    a: "The repository or plan selection does not by itself establish HIPAA compliance. A healthcare deployment requires review of the exact configuration, providers, contracts, access controls, retention, operations, and legal obligations. Do not process PHI until your organization completes that review.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit and debit cards (Visa, Mastercard, American Express) processed securely through Stripe. Enterprise customers can also pay by invoice.",
  },
  {
    q: "How do I get started with Enterprise?",
    a: "Reach out to our sales team through the Contact Sales button. We will work with you to tailor agents, minutes, concurrency, and SLAs to your exact needs.",
  },
];

/* ------------------------------------------------------------------ */
/*  JSON-LD schemas                                                    */
/* ------------------------------------------------------------------ */

const pricingSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "QuickVoice",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires JavaScript. Requires HTML5.",
  url: "https://quickvoice.co/pricing",
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description: "1 agent, 15 mins/mo, browser only",
    },
    {
      "@type": "Offer",
      name: "PAYG",
      price: "0",
      priceCurrency: "USD",
      description: "Pay $0.25/min, 1 agent, telephony enabled",
    },
    {
      "@type": "Offer",
      name: "Starter",
      price: "49",
      priceCurrency: "USD",
      description: "3 agents, 245 mins/mo included",
    },
    {
      "@type": "Offer",
      name: "Growth",
      price: "99",
      priceCurrency: "USD",
      description: "5 agents, 600 mins/mo included",
    },
    {
      "@type": "Offer",
      name: "Scale",
      price: "399",
      priceCurrency: "USD",
      description: "10 agents, 2,660 mins/mo included",
    },
    {
      "@type": "Offer",
      name: "Enterprise",
      price: "1500",
      priceCurrency: "USD",
      description: "Custom agents and minutes, dedicated support",
    },
  ],
};

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

/* ================================================================== */
/*  Page component                                                     */
/* ================================================================== */

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── JSON-LD ─────────────────────────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-16 text-center">
        {/* Decorative blurs */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-[10%] left-1/2 h-[40%] w-[60%] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-[10%] -right-[10%] h-[40%] w-[40%] rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="container mx-auto max-w-4xl px-4">
          <p className="mb-4 inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1 text-sm font-medium text-primary">
            Pricing
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Simple, Transparent Pricing
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Start free, upgrade when you are ready. Every plan includes
            per-second billing, so you only pay for what you use.
          </p>
        </div>
      </section>

      {/* ── Plan Cards (mobile) & Table (desktop) ───────────────── */}
      <section className="container mx-auto max-w-7xl px-4 pb-20">
        {/* ---- Mobile: stacked cards ---- */}
        <div className="grid gap-6 sm:grid-cols-2 lg:hidden">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-6 ${
                plan.popular
                  ? "border-primary ring-2 ring-primary/50 shadow-lg"
                  : "border-border"
              } bg-background`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                  POPULAR
                </span>
              )}
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold">{plan.price}</span>
                {plan.period && (
                  <span className="text-muted-foreground">{plan.period}</span>
                )}
              </div>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Agents:</span>{" "}
                  {plan.agents}
                </li>
                <li>
                  <span className="font-medium text-foreground">Minutes:</span>{" "}
                  {plan.minutes}
                </li>
                {plan.effectiveRate !== "—" && (
                  <li>
                    <span className="font-medium text-foreground">
                      Effective rate:
                    </span>{" "}
                    {plan.effectiveRate}
                  </li>
                )}
                {plan.overageRate !== "—" && (
                  <li>
                    <span className="font-medium text-foreground">
                      Overage:
                    </span>{" "}
                    {plan.overageRate}
                  </li>
                )}
              </ul>
              <ul className="mt-4 space-y-1.5 text-sm">
                {plan.keyFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.ctaHref}
                className={`mt-6 block w-full rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                  plan.popular
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border bg-muted hover:bg-muted/80 text-foreground"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* ---- Desktop: comparison table ---- */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-border p-4 text-left font-medium text-muted-foreground">
                  &nbsp;
                </th>
                {PLANS.map((plan) => (
                  <th
                    key={plan.name}
                    className={`relative border-b p-4 text-center font-semibold ${
                      plan.popular
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    {plan.popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                        POPULAR
                      </span>
                    )}
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {/* Price */}
              <tr>
                <td className="p-4 font-medium">Price</td>
                {PLANS.map((plan) => (
                  <td
                    key={plan.name}
                    className={`p-4 text-center ${
                      plan.popular ? "bg-primary/5" : ""
                    }`}
                  >
                    <span className="text-xl font-bold">{plan.price}</span>
                    {plan.period && (
                      <span className="text-muted-foreground">
                        {plan.period}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
              {/* Agents */}
              <tr>
                <td className="p-4 font-medium">Agents included</td>
                {PLANS.map((plan) => (
                  <td
                    key={plan.name}
                    className={`p-4 text-center ${
                      plan.popular ? "bg-primary/5" : ""
                    }`}
                  >
                    {plan.agents}
                  </td>
                ))}
              </tr>
              {/* Minutes */}
              <tr>
                <td className="p-4 font-medium">Minutes per month</td>
                {PLANS.map((plan) => (
                  <td
                    key={plan.name}
                    className={`p-4 text-center ${
                      plan.popular ? "bg-primary/5" : ""
                    }`}
                  >
                    {plan.minutes}
                  </td>
                ))}
              </tr>
              {/* Effective rate */}
              <tr>
                <td className="p-4 font-medium">Effective rate</td>
                {PLANS.map((plan) => (
                  <td
                    key={plan.name}
                    className={`p-4 text-center ${
                      plan.popular ? "bg-primary/5" : ""
                    }`}
                  >
                    {plan.effectiveRate}
                  </td>
                ))}
              </tr>
              {/* Overage */}
              <tr>
                <td className="p-4 font-medium">Overage rate</td>
                {PLANS.map((plan) => (
                  <td
                    key={plan.name}
                    className={`p-4 text-center ${
                      plan.popular ? "bg-primary/5" : ""
                    }`}
                  >
                    {plan.overageRate}
                  </td>
                ))}
              </tr>
              {/* Key features */}
              <tr>
                <td className="p-4 align-top font-medium">Key features</td>
                {PLANS.map((plan) => (
                  <td
                    key={plan.name}
                    className={`p-4 text-center align-top ${
                      plan.popular ? "bg-primary/5" : ""
                    }`}
                  >
                    <ul className="inline-block space-y-1 text-left text-xs text-muted-foreground">
                      {plan.keyFeatures.map((f) => (
                        <li key={f} className="flex items-start gap-1.5">
                          <svg
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
              {/* CTA row */}
              <tr>
                <td className="p-4">&nbsp;</td>
                {PLANS.map((plan) => (
                  <td
                    key={plan.name}
                    className={`p-4 text-center ${
                      plan.popular ? "bg-primary/5" : ""
                    }`}
                  >
                    <Link
                      href={plan.ctaHref}
                      className={`inline-block rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
                        plan.popular
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border border-border bg-muted hover:bg-muted/80 text-foreground"
                      }`}
                    >
                      {plan.cta}
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Feature Matrix ──────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/30 py-20">
        <div className="container mx-auto max-w-7xl px-4">
          <h2 className="mb-2 text-center text-3xl font-bold tracking-tight">
            Full Feature Comparison
          </h2>
          <p className="mx-auto mb-12 max-w-xl text-center text-muted-foreground">
            See exactly what is included in every plan so you can pick the right
            fit for your team.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b border-border p-3 text-left font-medium text-muted-foreground">
                    Feature
                  </th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.name}
                      className={`border-b p-3 text-center font-semibold ${
                        plan.popular
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {FEATURE_ROWS.map((row) => (
                  <tr key={row.label}>
                    <td className="p-3 font-medium">{row.label}</td>
                    {row.plans.map((available, i) => (
                      <td
                        key={PLANS[i].name}
                        className={`p-3 text-center ${
                          PLANS[i].popular ? "bg-primary/5" : ""
                        }`}
                      >
                        {available ? (
                          <svg
                            className="mx-auto h-5 w-5 text-primary"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    ))}
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
            Pricing FAQs
          </h2>
          <p className="mx-auto mb-12 max-w-xl text-center text-muted-foreground">
            Have questions? We have answers. If you need more help, feel free to{" "}
            <Link
              href="/company/contact"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              contact our team
            </Link>
            .
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

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/30 py-20">
        <div className="container mx-auto max-w-2xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Ready to automate your calls?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Compare the hosted options with the open-source path, then validate
            current terms and provider costs for your deployment.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href={REGISTER_URL}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Get Started Free
            </Link>
            <Link
              href="/company/contact"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-8 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
