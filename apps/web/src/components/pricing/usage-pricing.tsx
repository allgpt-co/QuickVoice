import {
  ArrowRight,
  Bot,
  ChevronDown,
  CreditCard,
  Phone,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CONTACT_URL, DEMO_BOOKING_URL, REGISTER_URL } from "@/lib/links";

const COST_COMPONENTS = [
  {
    icon: Bot,
    title: "AI model usage",
    price: "Provider market cost + 20%",
    description:
      "Speech-to-text, text-to-speech, and language models are metered in their actual provider units.",
  },
  {
    icon: Phone,
    title: "Telephony",
    price: "Provider cost + 20%",
    description:
      "Carrier charges vary by provider, destination, call direction, and rounding rules.",
  },
  {
    icon: WalletCards,
    title: "Platform fee",
    price: "$0.01 / connected minute",
    description:
      "Charged for connected time and prorated per second, including partial minutes.",
  },
  {
    icon: CreditCard,
    title: "Phone numbers",
    price: "From $2 / 30 days",
    description:
      "Each rental is the greater of $2 or provider rent plus 20%. Rental and renewal use paid credit.",
  },
] as const;

export const PRICING_FAQS = [
  {
    q: "How should we budget for self-hosting?",
    a: "The MIT software license and the cost of operating it are separate. A self-hosted deployment needs its own hosting, AI and telephony providers, phone numbers, implementation, monitoring, and human follow-up. The hosted wallet formula on this page describes QuickVoice-hosted usage; review your own provider agreements and operating costs when self-hosting.",
  },
  {
    q: "Do I need a monthly subscription?",
    a: "No. Hosted QuickVoice uses a prepaid wallet. Add credit in $5 increments from $5 to $500 and spend it on measured call usage and phone-number rental.",
  },
  {
    q: "How does the $5 signup credit work?",
    a: "When the hosted signup promotion is enabled, eligible new users who verify their email can receive a one-time $5 call credit in their first owned organization. Eligibility depends on the promotion start date and prior grants; creating another organization does not grant another credit. Granted credit has no expiry and is for call usage only, not phone-number purchase or renewal.",
  },
  {
    q: "What determines the cost of a call?",
    a: "Each call combines measured STT, TTS, and LLM usage at provider market cost plus 20%, telephony at provider cost plus 20%, and a $0.01 platform fee per connected minute prorated per second.",
  },
  {
    q: "Can QuickVoice recharge the wallet automatically?",
    a: "Yes. After saving a payment method, owners and admins can choose a balance threshold and an automatic recharge amount. Both use $5 increments, and automatic recharge is off until you enable it.",
  },
  {
    q: "What happens when the wallet runs out?",
    a: "QuickVoice reserves enough credit for the next short slice of a call and stops the call before funds are exhausted. Phone-number renewals are retried during a short grace period; numbers can be released if the account is not recharged.",
  },
  {
    q: "Is QuickVoice HIPAA-compliant?",
    a: "The repository or pricing selection does not by itself establish HIPAA compliance. A healthcare deployment requires review of the exact configuration, providers, contracts, access controls, retention, operations, and legal obligations. Do not process PHI until your organization completes that review.",
  },
] as const;

export function UsagePricing() {
  return (
    <div className="bg-background text-foreground">
      <section className="page-section border-b border-border">
        <div className="site-container grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="eyebrow">Usage-based pricing</p>
            <h1 className="page-title mt-4">
              Understand how call costs add up.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Hosted QuickVoice combines measured AI usage, telephony, and
              connected time in one prepaid USD wallet. Your model and carrier
              choices determine the total.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a
                  href={DEMO_BOOKING_URL}
                  data-analytics-location="pricing_hero"
                >
                  Book a demo <ArrowRight aria-hidden="true" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={CONTACT_URL} data-analytics-location="pricing_hero">
                  Ask a pricing question
                </Link>
              </Button>
            </div>
          </div>
          <aside
            className="surface-card p-6 sm:p-8"
            aria-labelledby="pricing-formula"
          >
            <p className="eyebrow">How charges add up</p>
            <h2
              id="pricing-formula"
              className="mt-4 text-2xl font-semibold tracking-tight"
            >
              One formula. Measured usage.
            </h2>
            <dl className="mt-6 divide-y divide-border text-sm">
              <div className="flex justify-between gap-4 py-3">
                <dt>AI provider cost</dt>
                <dd className="font-semibold">× 1.20</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt>Telephony provider cost</dt>
                <dd className="font-semibold">× 1.20</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt>Connected minutes</dt>
                <dd className="font-semibold">× $0.01</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt>Phone-number rental</dt>
                <dd className="font-semibold">Separate charge</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              No minute bundle or hosted subscription is required. Add paid
              credit when you need it.
            </p>
          </aside>
        </div>
      </section>

      <section className="page-section">
        <div className="site-container">
          <p className="eyebrow">What you pay for</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Four clear cost components
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            Rates vary with the models, voices, countries, and carriers you
            select. The wallet ledger records measured charges.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {COST_COMPONENTS.map((item) => (
              <article key={item.title} className="surface-card p-6">
                <item.icon className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                <p className="mt-3 text-lg font-semibold text-primary">
                  {item.price}
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-border bg-muted/40 p-6">
            <h3 className="font-semibold">An example of the arithmetic</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              If measured provider costs were $10 for AI and $5 for telephony
              over 100 connected minutes, call charges would be $12 + $6 + $1 =
              $19. These are illustrative inputs, not quoted provider rates;
              phone-number rental and any applicable tax are additional.
            </p>
          </div>
        </div>
      </section>

      <section className="page-section border-y border-border bg-muted/25">
        <div className="site-container grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="eyebrow">Wallet controls</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Plan usage, then fund it.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Owners and admins manage payment methods and recharge rules.
              Members can view the balance and transaction ledger.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <article className="surface-card p-6">
              <h3 className="text-lg font-semibold">Manual top-ups</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Add $5 to $500 in $5 increments. The full top-up amount is
                credited; applicable tax is extra.
              </p>
            </article>
            <article className="surface-card p-6">
              <h3 className="text-lg font-semibold">Optional auto-recharge</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Save a payment method, then choose a threshold and recharge
                amount. Automatic recharge stays off until enabled.
              </p>
            </article>
            <article className="surface-card p-6 sm:col-span-2">
              <h3 className="text-lg font-semibold">
                Signup credit, when available
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                An enabled hosted promotion can grant eligible verified new
                users $5 in call credit in their first owned organization. Check
                your wallet for the grant before testing. Promotional credit
                cannot buy or renew phone numbers.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="site-container grid gap-8 lg:grid-cols-[0.65fr_1.35fr]">
          <div>
            <p className="eyebrow">Questions, answered</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Pricing details
            </h2>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {PRICING_FAQS.map((faq) => (
              <details key={faq.q} className="group py-5">
                <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-5 text-base font-semibold">
                  {faq.q}
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section border-t border-border bg-muted/25">
        <div className="site-container">
          <h2 className="text-3xl font-semibold tracking-tight">
            Bring a workflow. Review the costs.
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            Discuss call volume, provider choices, and the implementation your
            team needs before planning a pilot.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a
                href={DEMO_BOOKING_URL}
                data-analytics-location="pricing_footer"
              >
                Book a demo <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={CONTACT_URL} data-analytics-location="pricing_footer">
                Contact the team
              </Link>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Ready to configure it yourself?{" "}
            <Link
              href={REGISTER_URL}
              data-analytics-location="pricing_technical"
              className="font-medium text-primary underline underline-offset-4"
            >
              Create a hosted account
            </Link>{" "}
            or{" "}
            <Link
              href="/open-source"
              className="font-medium text-primary underline underline-offset-4"
            >
              inspect the source
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
