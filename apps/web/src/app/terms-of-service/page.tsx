import type { Metadata } from "next";
import Link from "next/link";
import { DEMO_BOOKING_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "QuickVoice Terms of Service — usage terms, acceptable use policy, billing, liability, and your rights when using our AI voice agent platform.",
  alternates: {
    canonical: "https://quickvoice.co/terms-of-service",
  },
  openGraph: {
    title: "Terms of Service",
    description:
      "QuickVoice Terms of Service — usage terms, acceptable use, and your rights.",
    type: "website",
    url: "https://quickvoice.co/terms-of-service",
    siteName: "QuickVoice",
  },
  twitter: {
    card: "summary",
    title: "Terms of Service | QuickVoice",
    description:
      "QuickVoice Terms of Service — usage terms, acceptable use, and your rights.",
  },
};

const TERMS_SECTIONS = [
  "Acceptance",
  "Services",
  "Account security",
  "Billing",
  "Acceptable use",
  "Contact",
] as const;

export default function TermsOfServicePage() {
  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-20 sm:py-28">
        {/* Header */}
        <header className="mb-16">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-muted-foreground">
            Last updated: August 2026
          </p>
        </header>

        <section className="mb-12 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-semibold text-foreground">On this page</p>
          <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {TERMS_SECTIONS.map((item) => (
              <span key={item} className="rounded-lg bg-muted/50 px-3 py-2">
                {item}
              </span>
            ))}
          </div>
        </section>

        {/* Content */}
        <div className="space-y-12 text-base leading-7">
          {/* 1. Acceptance of Terms */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              1. Acceptance of Terms
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                Welcome to QuickVoice. By accessing or using the QuickVoice
                platform, website, APIs, or any associated services
                (collectively, the &ldquo;Services&rdquo;), you agree to be
                bound by these Terms of Service (&ldquo;Terms&rdquo;). If you
                are using the Services on behalf of an organization, you
                represent and warrant that you have the authority to bind that
                organization to these Terms, and references to &ldquo;you&rdquo;
                or &ldquo;your&rdquo; shall include that organization.
              </p>
              <p>
                If you do not agree to these Terms, you must not access or use
                the Services. Your continued use of the Services following any
                changes to these Terms constitutes acceptance of those changes.
              </p>
            </div>
          </section>

          {/* 2. Description of Services */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              2. Description of Services
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                QuickVoice provides an AI-powered voice agent platform that
                enables businesses to create, deploy, and manage intelligent
                voice agents for automated phone conversations. Our Services
                include, but are not limited to:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  AI voice agent creation, configuration, and deployment tools
                </li>
                <li>Inbound and outbound automated voice call handling</li>
                <li>
                  Integration with third-party telephony, CRM, and business
                  systems
                </li>
                <li>Call analytics, transcription, and reporting dashboards</li>
                <li>API access for programmatic voice agent management</li>
                <li>
                  Knowledge base management and voice agent training tools
                </li>
              </ul>
              <p>
                QuickVoice reserves the right to modify, suspend, or discontinue
                any part of the Services at any time with reasonable notice. We
                will make commercially reasonable efforts to notify you of
                material changes that affect your use of the Services.
              </p>
            </div>
          </section>

          {/* 3. Account Registration and Security */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              3. Account Registration and Security
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                To use certain features of the Services, you must create an
                account. When registering, you agree to:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  Provide accurate, current, and complete information during
                  registration and keep your account information up to date
                </li>
                <li>
                  Create a strong password and maintain the confidentiality of
                  your login credentials
                </li>
                <li>
                  Accept responsibility for all activities that occur under your
                  account, whether or not authorized by you
                </li>
                <li>
                  Notify QuickVoice immediately at{" "}
                  <a
                    href="mailto:support@quickvoice.co"
                    className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                  >
                    support@quickvoice.co
                  </a>{" "}
                  if you suspect unauthorized access to or use of your account
                </li>
                <li>
                  Not share, transfer, or sell your account credentials to any
                  third party
                </li>
              </ul>
              <p>
                QuickVoice reserves the right to suspend or terminate accounts
                that violate these Terms or that have been inactive for an
                extended period, in accordance with applicable law and with
                reasonable notice where practicable.
              </p>
            </div>
          </section>

          {/* 4. Prepaid Wallet, Usage Charges, and Phone Numbers */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              4. Prepaid Wallet, Usage Charges, and Phone Numbers
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                QuickVoice generally provides the hosted Services through a
                prepaid, US-dollar wallet maintained at the organization level.
                Unless you have a separate written agreement or are completing
                a transition from a legacy plan, adding wallet credit does not
                create a monthly or annual subscription.
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-foreground">Paid Credit:</strong>{" "}
                  You may add paid wallet credit in $5 increments, from $5 to
                  $500 per top-up. The full purchased amount is credited after
                  Stripe confirms payment; QuickVoice absorbs ordinary payment
                  processor fees. Taxes, if applicable, may be charged
                  separately. Wallet credit is not a bank account, deposit, or
                  stored-value product and does not earn interest.
                </li>
                <li>
                  <strong className="text-foreground">
                    Promotional Credit:
                  </strong>{" "}
                  An eligible newly verified user may receive a one-time $5
                  promotional call credit in the user&apos;s first organization.
                  Promotional credit may be used for browser, widget, inbound,
                  and outbound call usage, but cannot be used to buy or renew a
                  phone number. It is non-transferable, has no cash value, is
                  not refundable, and does not expire while the account remains
                  active. Eligible call usage consumes promotional credit before
                  paid credit.
                </li>
                <li>
                  <strong className="text-foreground">Usage Charges:</strong>{" "}
                  Calls consume credit based on actual measured speech-to-text,
                  text-to-speech, and language-model usage at the applicable
                  provider market cost plus 20%; telephony at the applicable
                  carrier or provider cost plus 20%; and a QuickVoice platform
                  fee of $0.01 per connected minute, prorated per second.
                  Provider minimums, increments, and rounding may affect the
                  final amount. Current estimates are informational, and rates
                  may change prospectively as provider pricing or our published
                  pricing changes.
                </li>
                <li>
                  <strong className="text-foreground">
                    Holds and Settlement:
                  </strong>{" "}
                  QuickVoice may place a temporary wallet hold before a call or
                  phone-number transaction. A hold reserves credit and is not a
                  final charge. After processing, QuickVoice settles the actual
                  charge and releases unused reserved credit. Calls may be
                  stopped when available credit is exhausted. Delayed provider
                  records or reconciliation may result in an outstanding debt;
                  future credits are first applied to that debt, and calling may
                  remain suspended until it is paid.
                </li>
                <li>
                  <strong className="text-foreground">
                    Payment Methods and Auto-Reload:
                  </strong>{" "}
                  You may save a valid payment method and optionally enable
                  auto-reload. If enabled, you authorize QuickVoice and Stripe
                  to charge that payment method off-session for the amount you
                  choose when available wallet credit reaches your selected
                  threshold. You may disable auto-reload at any time, but doing
                  so does not reverse a charge already initiated. Failed or
                  declined reloads may interrupt calls and number renewals.
                </li>
                <li>
                  <strong className="text-foreground">Phone Numbers:</strong>{" "}
                  Phone-number rentals are payable only with paid credit. Each
                  number costs the greater of $2 or the provider rental cost
                  plus 20% for each 30-day rental period. If paid credit is
                  insufficient at renewal, QuickVoice may suspend and unlink the
                  number, attempt auto-reload if you enabled it, and retry
                  renewal daily. If renewal remains unpaid, the number is
                  scheduled for release 72 hours after suspension and may be
                  permanently lost or reassigned by the provider.
                </li>
                <li>
                  <strong className="text-foreground">
                    Refunds, Reversals, and Debt:
                  </strong>{" "}
                  Except where required by law, top-ups and consumed usage
                  charges are generally non-refundable. Promotional credit is
                  never refundable or redeemable for cash. An approved refund,
                  chargeback, or payment reversal removes the corresponding paid
                  credit. If that credit has already been consumed, your wallet
                  may show an outstanding debt that remains due, including after
                  account closure. Contact support promptly about a suspected
                  billing error; verified errors will be corrected.
                </li>
                <li>
                  <strong className="text-foreground">Taxes:</strong> Fees are
                  exclusive of applicable taxes unless stated otherwise. You are
                  responsible for taxes associated with your use of the
                  Services, excluding taxes based on QuickVoice&apos;s net income.
                </li>
              </ul>
            </div>
          </section>

          {/* 5. Acceptable Use Policy */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              5. Acceptable Use Policy
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                You agree to use the Services only for lawful purposes and in
                accordance with these Terms. You shall not use the Services to:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  Violate any applicable local, state, national, or
                  international law or regulation, including but not limited to
                  the Telephone Consumer Protection Act (TCPA), telemarketing
                  laws, and do-not-call regulations
                </li>
                <li>
                  Make automated calls or send communications without obtaining
                  proper consent from recipients as required by applicable law
                </li>
                <li>
                  Engage in fraudulent, deceptive, or misleading practices,
                  including misrepresenting the AI nature of voice agents where
                  disclosure is required by law
                </li>
                <li>
                  Harass, abuse, threaten, or intimidate any person through
                  voice agents or any other use of the Services
                </li>
                <li>
                  Transmit or facilitate the distribution of malware, viruses,
                  or other harmful code
                </li>
                <li>
                  Attempt to gain unauthorized access to any part of the
                  Services, other accounts, or any systems or networks connected
                  to the Services
                </li>
                <li>
                  Reverse engineer, decompile, disassemble, or otherwise attempt
                  to derive the source code of the Services
                </li>
                <li>
                  Use the Services in a manner that could overburden, impair, or
                  compromise the infrastructure or interfere with other
                  users&apos; use of the Services
                </li>
                <li>
                  Resell, sublicense, or redistribute the Services without
                  QuickVoice&apos;s prior written consent
                </li>
                <li>
                  Use the Services to collect, store, or process sensitive
                  personal information (such as health or financial data) in
                  violation of applicable privacy laws
                </li>
              </ul>
              <p>
                QuickVoice reserves the right to investigate and take
                appropriate action against violations of this Acceptable Use
                Policy, including suspending or terminating your access to the
                Services and reporting conduct to law enforcement authorities.
              </p>
            </div>
          </section>

          {/* 6. Intellectual Property */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              6. Intellectual Property
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                <strong className="text-foreground">
                  QuickVoice&apos;s Intellectual Property:
                </strong>{" "}
                The Services, including all software, algorithms, AI models,
                user interface designs, documentation, trademarks, logos, and
                other materials, are owned by or licensed to QuickVoice and are
                protected by copyright, trademark, patent, trade secret, and
                other intellectual property laws. Nothing in these Terms grants
                you any right, title, or interest in the Services except for the
                limited right to use the Services as expressly permitted under
                these Terms.
              </p>
              <p>
                <strong className="text-foreground">Your Content:</strong> You
                retain ownership of all data, content, scripts, prompts, and
                configurations that you upload, create, or input into the
                Services (&ldquo;Your Content&rdquo;). By using the Services,
                you grant QuickVoice a limited, non-exclusive, worldwide,
                royalty-free license to use, process, and store Your Content
                solely for the purpose of providing and improving the Services.
              </p>
              <p>
                <strong className="text-foreground">Feedback:</strong> If you
                provide suggestions, ideas, or feedback about the Services
                (&ldquo;Feedback&rdquo;), you grant QuickVoice a perpetual,
                irrevocable, royalty-free license to use, modify, and
                incorporate that Feedback into the Services without any
                obligation to you.
              </p>
            </div>
          </section>

          {/* 7. Data Privacy */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              7. Data Privacy
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                Your privacy is important to us. Our collection, use, and
                disclosure of personal information in connection with the
                Services is described in our{" "}
                <a
                  href="/privacy-policy"
                  className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                >
                  Privacy Policy
                </a>
                , which is incorporated into these Terms by reference.
              </p>
              <p>By using the Services, you acknowledge and agree that:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  QuickVoice may collect and process voice data, call
                  recordings, transcripts, and metadata as part of delivering
                  the Services
                </li>
                <li>
                  You are responsible for complying with all applicable data
                  protection and privacy laws when using the Services, including
                  obtaining necessary consents from individuals whose data is
                  processed through your voice agents
                </li>
                <li>
                  You will not use the Services to process personal data in a
                  manner that violates applicable law or any data processing
                  agreement between you and QuickVoice
                </li>
                <li>
                  Where required, QuickVoice will enter into appropriate data
                  processing agreements to support your compliance with
                  applicable data protection regulations (such as GDPR or CCPA)
                </li>
              </ul>
            </div>
          </section>

          {/* 8. Service Availability and SLA */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              8. Service Availability and SLA
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                QuickVoice strives to maintain high availability of the
                Services. While we target 99.9% uptime for our production
                infrastructure, we do not guarantee uninterrupted or error-free
                operation. Specifically:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-foreground">
                    Scheduled Maintenance:
                  </strong>{" "}
                  QuickVoice may perform scheduled maintenance that temporarily
                  affects availability. We will provide reasonable advance
                  notice of scheduled maintenance windows.
                </li>
                <li>
                  <strong className="text-foreground">
                    Unscheduled Downtime:
                  </strong>{" "}
                  In the event of unscheduled outages, QuickVoice will use
                  commercially reasonable efforts to restore the Services as
                  quickly as possible and communicate status updates through our
                  status page.
                </li>
                <li>
                  <strong className="text-foreground">SLA Credits:</strong>{" "}
                  Customers with a separate written service agreement may be
                  entitled to service credits for downtime that exceeds an
                  uptime commitment stated in that agreement. Wallet top-ups
                  alone do not create an SLA or entitlement to service credits.
                </li>
                <li>
                  <strong className="text-foreground">Exclusions:</strong>{" "}
                  Uptime commitments do not apply to outages caused by factors
                  outside QuickVoice&apos;s reasonable control, including
                  internet connectivity issues, third-party service failures,
                  force majeure events, or your misuse of the Services.
                </li>
              </ul>
            </div>
          </section>

          {/* 9. Limitation of Liability */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              9. Limitation of Liability
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>To the maximum extent permitted by applicable law:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-foreground">
                    No Indirect Damages:
                  </strong>{" "}
                  In no event shall QuickVoice, its affiliates, officers,
                  directors, employees, or agents be liable for any indirect,
                  incidental, special, consequential, or punitive damages,
                  including but not limited to loss of profits, revenue, data,
                  business opportunities, or goodwill, arising out of or in
                  connection with these Terms or your use of the Services,
                  regardless of the theory of liability.
                </li>
                <li>
                  <strong className="text-foreground">Liability Cap:</strong>{" "}
                  QuickVoice&apos;s total aggregate liability for all claims
                  arising out of or related to these Terms or the Services shall
                  not exceed the greater of (a) the total fees you paid to
                  QuickVoice during the twelve (12) months immediately preceding
                  the event giving rise to the claim, or (b) one hundred US
                  dollars ($100).
                </li>
                <li>
                  <strong className="text-foreground">
                    AI-Generated Content:
                  </strong>{" "}
                  The Services utilize artificial intelligence to generate voice
                  responses. QuickVoice does not guarantee the accuracy,
                  completeness, or appropriateness of AI-generated content. You
                  acknowledge that AI voice agents may occasionally produce
                  errors, and you are responsible for monitoring and reviewing
                  interactions as appropriate for your use case.
                </li>
                <li>
                  <strong className="text-foreground">No Warranty:</strong> The
                  Services are provided on an &ldquo;as is&rdquo; and &ldquo;as
                  available&rdquo; basis without warranties of any kind, whether
                  express, implied, or statutory, including but not limited to
                  implied warranties of merchantability, fitness for a
                  particular purpose, and non-infringement.
                </li>
              </ul>
            </div>
          </section>

          {/* 10. Indemnification */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              10. Indemnification
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                You agree to indemnify, defend, and hold harmless QuickVoice,
                its affiliates, officers, directors, employees, agents, and
                licensors from and against any and all claims, liabilities,
                damages, losses, costs, and expenses (including reasonable
                attorneys&apos; fees) arising out of or related to:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>Your use or misuse of the Services</li>
                <li>Your violation of these Terms</li>
                <li>
                  Your violation of any applicable law, regulation, or
                  third-party right, including privacy, telecommunications, and
                  consumer protection laws
                </li>
                <li>
                  Your Content or any data you process through the Services
                </li>
                <li>
                  Any claims made by third parties in connection with calls or
                  communications initiated through your voice agents
                </li>
              </ul>
              <p>
                QuickVoice reserves the right to assume the exclusive defense
                and control of any matter subject to indemnification by you, in
                which case you agree to cooperate with QuickVoice in asserting
                any available defenses.
              </p>
            </div>
          </section>

          {/* 11. Termination */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              11. Termination
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>Either party may terminate these Terms as follows:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-foreground">By You:</strong> You may
                  terminate your account at any time by contacting us at{" "}
                  <a
                    href="mailto:support@quickvoice.co"
                    className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                  >
                    support@quickvoice.co
                  </a>{" "}
                  or through the account settings in the platform. Disabling
                  auto-reload alone does not close your account. Before closure,
                  pending usage may need to settle and any outstanding debt
                  remains immediately due.
                </li>
                <li>
                  <strong className="text-foreground">By QuickVoice:</strong>{" "}
                  QuickVoice may suspend or terminate your access to the
                  Services immediately and without prior notice if you breach
                  these Terms, engage in conduct that is harmful to other users
                  or the Services, or if required to do so by law. For
                  non-breach terminations, QuickVoice will provide at least 30
                  days&apos; notice.
                </li>
              </ul>
              <p>Upon termination:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  Your right to access and use the Services will cease, and any
                  rented phone numbers will be released and may be permanently
                  lost
                </li>
                <li>
                  Promotional credit will be forfeited. Any remaining paid
                  credit will be handled under the refund and reversal terms in
                  Section 4, subject to applicable law, pending settlement, and
                  outstanding debt
                </li>
                <li>
                  QuickVoice will make Your Content available for export for a
                  period of 30 days following termination, after which it may be
                  permanently deleted
                </li>
                <li>
                  Sections of these Terms that by their nature should survive
                  termination will survive, including intellectual property,
                  limitation of liability, indemnification, and governing law
                  provisions
                </li>
              </ul>
            </div>
          </section>

          {/* 12. Governing Law and Dispute Resolution */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              12. Governing Law and Dispute Resolution
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                These Terms shall be governed by and construed in accordance
                with the laws of the State of Delaware, United States, without
                regard to its conflict-of-law principles.
              </p>
              <p>
                Any dispute, controversy, or claim arising out of or relating to
                these Terms or the Services shall first be resolved through good
                faith negotiation between the parties. If the dispute cannot be
                resolved through negotiation within 30 days, either party may
                submit the dispute to binding arbitration administered by the
                American Arbitration Association (AAA) under its Commercial
                Arbitration Rules.
              </p>
              <p>
                The arbitration shall be conducted in English and take place in
                Wilmington, Delaware, unless the parties mutually agree to an
                alternative location or virtual proceedings. The
                arbitrator&apos;s decision shall be final and binding and may be
                entered as a judgment in any court of competent jurisdiction.
              </p>
              <p>
                To the extent permitted by law, you agree that any claims shall
                be brought in your individual capacity and not as a plaintiff or
                class member in any purported class action, collective action,
                or representative proceeding.
              </p>
            </div>
          </section>

          {/* 13. Changes to Terms */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              13. Changes to Terms
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                QuickVoice reserves the right to update or modify these Terms at
                any time. When we make changes, we will:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  Update the &ldquo;Last updated&rdquo; date at the top of this
                  page
                </li>
                <li>
                  Notify you of material changes via email to the address
                  associated with your account or through an in-platform
                  notification at least 30 days before the changes take effect
                </li>
                <li>
                  Provide a summary of significant changes for your convenience
                </li>
              </ul>
              <p>
                Your continued use of the Services after the effective date of
                revised Terms constitutes your acceptance of the changes. If you
                do not agree to the revised Terms, you must stop using the
                Services and may terminate your account in accordance with
                Section 11.
              </p>
            </div>
          </section>

          {/* 14. General Provisions */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              14. General Provisions
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                <strong className="text-foreground">Entire Agreement:</strong>{" "}
                These Terms, together with the Privacy Policy and any applicable
                order forms or service agreements, constitute the entire
                agreement between you and QuickVoice regarding the Services and
                supersede all prior agreements and understandings.
              </p>
              <p>
                <strong className="text-foreground">Severability:</strong> If
                any provision of these Terms is held to be invalid or
                unenforceable, the remaining provisions shall continue in full
                force and effect, and the invalid provision shall be modified to
                the minimum extent necessary to make it valid and enforceable.
              </p>
              <p>
                <strong className="text-foreground">Waiver:</strong> The failure
                of QuickVoice to enforce any right or provision of these Terms
                shall not constitute a waiver of that right or provision.
              </p>
              <p>
                <strong className="text-foreground">Assignment:</strong> You may
                not assign or transfer these Terms or your rights under them
                without QuickVoice&apos;s prior written consent. QuickVoice may
                assign these Terms in connection with a merger, acquisition, or
                sale of all or substantially all of its assets.
              </p>
              <p>
                <strong className="text-foreground">Force Majeure:</strong>{" "}
                QuickVoice shall not be liable for any failure or delay in
                performing its obligations under these Terms due to
                circumstances beyond its reasonable control, including natural
                disasters, war, terrorism, pandemics, strikes, government
                actions, or failures of third-party services or infrastructure.
              </p>
            </div>
          </section>

          {/* 15. Contact Information */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight">
              15. Contact Information
            </h2>
            <div className="mt-4 space-y-4 text-muted-foreground">
              <p>
                If you have any questions, concerns, or requests regarding these
                Terms of Service, please contact us at:
              </p>
              <div className="mt-2">
                <p className="font-medium text-foreground">QuickVoice</p>
                <p>
                  Email:{" "}
                  <a
                    href="mailto:support@quickvoice.co"
                    className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                  >
                    support@quickvoice.co
                  </a>
                </p>
                <p>
                  Website:{" "}
                  <a
                    href="https://quickvoice.co"
                    className="text-foreground underline underline-offset-4 hover:text-foreground/80"
                  >
                    https://quickvoice.co
                  </a>
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="border-t border-border bg-muted/30 py-12">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Want to review terms before rollout?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Schedule a demo to walk through onboarding, billing, usage, and
            compliance expectations with a QuickVoice specialist.
          </p>
          <Link
            href={DEMO_BOOKING_URL}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
          >
            Book a Demo
          </Link>
        </div>
      </section>
    </main>
  );
}
