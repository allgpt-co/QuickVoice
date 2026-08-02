import {
  Bot,
  Check,
  CreditCard,
  Gift,
  Phone,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import { CONTACT_URL, REGISTER_URL } from "@/lib/links";

const COST_COMPONENTS = [
  {
    icon: Bot,
    title: "AI model usage",
    price: "Market cost + 20%",
    description:
      "STT, TTS, and LLM selections determine spend. Usage is metered from the providers' actual units instead of a blended flat rate.",
  },
  {
    icon: Phone,
    title: "Telephony",
    price: "Provider cost + 20%",
    description:
      "Inbound and outbound carrier charges follow the selected provider, destination, and provider rounding rules.",
  },
  {
    icon: WalletCards,
    title: "QuickVoice platform",
    price: "$0.01 / connected minute",
    description:
      "The platform fee is prorated per second, so a partial connected minute is charged only for the connected time used.",
  },
  {
    icon: CreditCard,
    title: "Phone numbers",
    price: "From $2 / 30 days",
    description:
      "Rental is the greater of $2 or provider rent plus 20%. Numbers renew from paid wallet credit, never promotional credit.",
  },
] as const;

export const PRICING_FAQS = [
  {
    q: "Do I need a monthly subscription?",
    a: "No. Hosted QuickVoice uses a prepaid wallet. Add credit in $5 increments from $5 to $500 and spend it on measured call usage and phone-number rental.",
  },
  {
    q: "How does the $5 signup credit work?",
    a: "A newly verified user receives a one-time $5 promotional call credit in their first organization. It does not expire and can be used for browser, widget, inbound, and outbound call usage, but it cannot buy or renew phone numbers.",
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
    <div className="min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden px-4 pt-28 pb-20">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(var(--primary-rgb),0.18),transparent_35%),linear-gradient(135deg,rgba(var(--primary-rgb),0.08),transparent_50%)]" />
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div>
            <p className="mb-5 inline-flex rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              Usage-based pricing, no plan required
            </p>
            <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Pay for the voice stack you actually use.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Choose the speech and language models that fit each agent. QuickVoice
              meters their usage, carrier costs, and connected time against one
              prepaid USD wallet.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={REGISTER_URL}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                Start with $5 call credit
              </Link>
              <Link
                href={CONTACT_URL}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-7 py-3 text-sm font-semibold shadow-sm transition-colors hover:bg-muted"
              >
                Talk to sales
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              No card is needed to receive the one-time promotional call credit.
            </p>
          </div>

          <div className="border border-primary/20 bg-card p-7 shadow-xl shadow-primary/5 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Gift className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-muted-foreground">New verified users</p>
                <p className="text-3xl font-bold">$5 free call credit</p>
              </div>
            </div>
            <ul className="mt-7 space-y-4 text-sm">
              {[
                "Works for browser, widget, inbound, and outbound calls",
                "No expiry in the first organization",
                "Top up manually or enable threshold-based recharge",
                "Phone-number rental always uses paid credit",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20 py-20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              The complete cost formula
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Transparent components instead of minute bundles
            </h2>
            <p className="mt-4 text-muted-foreground">
              Provider prices vary by model, voice, country, destination, and
              carrier. Your agent configuration shows an estimate when a current
              rate is available; the wallet ledger records measured charges.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {COST_COMPONENTS.map((component) => (
              <article key={component.title} className="border bg-background p-6">
                <component.icon className="size-5 text-primary" />
                <h3 className="mt-5 text-base font-semibold">{component.title}</h3>
                <p className="mt-2 text-xl font-bold tracking-tight text-primary">
                  {component.price}
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {component.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Wallet controls
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Stay funded without buying a subscription.
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Owners and admins control payment methods and recharge rules. Members
              can still see the balance and transaction ledger.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="border bg-card p-6">
              <CreditCard className="size-5 text-primary" />
              <h3 className="mt-4 font-semibold">Manual top-ups</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Add $5 to $500 in $5 increments. The full amount is credited;
                QuickVoice absorbs Stripe processing fees and applicable tax is extra.
              </p>
            </div>
            <div className="border bg-card p-6">
              <RefreshCw className="size-5 text-primary" />
              <h3 className="mt-4 font-semibold">Automatic recharge</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Opt in after saving a card, then choose a threshold and reload amount.
                New settings default to a $5 threshold and a $20 recharge.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/20 py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">Pricing FAQs</h2>
          <dl className="mt-10 divide-y divide-border">
            {PRICING_FAQS.map((faq) => (
              <div key={faq.q} className="py-6">
                <dt className="font-semibold">{faq.q}</dt>
                <dd className="mt-2 leading-7 text-muted-foreground">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Build your first agent with $5 on us.</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Configure the models you want, test the complete call path, and add paid
            credit only when you are ready for more usage or a real phone number.
          </p>
          <Link
            href={REGISTER_URL}
            className="mt-8 inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Create a free account
          </Link>
        </div>
      </section>
    </div>
  );
}
