import type { Metadata } from "next";
import Link from "next/link";
import { DEMO_BOOKING_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "QuickVoice Privacy Policy: information collection, use, sharing, retention, privacy requests and contact details.",
  alternates: {
    canonical: "https://quickvoice.co/privacy-policy",
  },
  openGraph: {
    title: "Privacy Policy",
    description:
      "QuickVoice Privacy Policy — how we collect, use, and protect your data.",
    type: "website",
    url: "https://quickvoice.co/privacy-policy",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "QuickVoice Privacy Policy",
    description:
      "QuickVoice Privacy Policy — how we collect, use, and protect your data.",
  },
};

const PRIVACY_SECTIONS = [
  "Information we collect",
  "How we use information",
  "Data sharing",
  "Security and retention",
  "Your rights",
  "Contact us",
] as const;

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-background text-foreground">
      {/* Hero */}
      <section className="page-section border-b border-border bg-muted/25">
        <div className="site-container !max-w-3xl">
          <h1 className="page-title">
            Privacy Policy
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Last updated: February 2026
          </p>
        </div>
      </section>

      <section className="border-b border-border bg-background py-6">
        <div className="site-container !max-w-3xl">
          <div className="surface-card p-5">
            <p className="text-sm font-semibold text-foreground">
              On this page
            </p>
            <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {PRIVACY_SECTIONS.map((item, index) => (
                <a key={item} href={`#privacy-section-${[1, 2, 3, 4, 5, 11][index]}`} className="rounded-lg bg-muted/50 px-3 py-2 font-medium hover:text-primary">
                  {item}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="page-section">
        <div className="site-container !max-w-3xl">
          <div className="reading-content space-y-12">
            {/* Introduction */}
            <div>
              <p className="text-lg leading-relaxed text-muted-foreground">
                QuickVoice (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;)
                is committed to protecting your privacy. This Privacy Policy
                explains how we collect, use, disclose, and safeguard your
                information when you visit our website at{" "}
                <a
                  href="https://quickvoice.co"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  quickvoice.co
                </a>{" "}
                and use our AI voice agent platform and related services
                (collectively, the &quot;Services&quot;). Please read this
                Privacy Policy carefully. By accessing or using our Services,
                you acknowledge that you have read, understood, and agree to be
                bound by this Privacy Policy.
              </p>
            </div>

            {/* 1. Information We Collect */}
            <div>
              <h2 id="privacy-section-1" className="text-2xl font-semibold tracking-tight">
                1. Information We Collect
              </h2>

              <h3 className="mt-6 text-xl font-medium">
                1.1 Personal Information
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                When you register for an account, subscribe to our Services, or
                contact us, we may collect personally identifiable information,
                including but not limited to:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
                <li>Full name</li>
                <li>Email address</li>
                <li>Phone number</li>
                <li>Company name and job title</li>
                <li>
                  Billing and payment information (processed securely through
                  third-party payment processors)
                </li>
                <li>Mailing address</li>
                <li>Account credentials</li>
              </ul>

              <h3 className="mt-6 text-xl font-medium">1.2 Usage Data</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                We automatically collect certain information when you access or
                use our Services, including:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
                <li>IP address and approximate geolocation</li>
                <li>Browser type and version</li>
                <li>Operating system and device information</li>
                <li>
                  Pages visited, time spent on pages, and navigation paths
                </li>
                <li>Referring and exit URLs</li>
                <li>Date and time stamps of access</li>
                <li>Feature usage patterns within the platform</li>
                <li>
                  Voice agent interaction logs and analytics (e.g., call
                  duration, call outcomes, and aggregated performance metrics)
                </li>
              </ul>

              <h3 className="mt-6 text-xl font-medium">
                1.3 Cookies and Tracking Technologies
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                We use cookies, web beacons, pixels, and similar tracking
                technologies to enhance your experience, analyze trends, and
                administer our Services. The types of cookies we use include:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
                <li>
                  <strong className="text-foreground">
                    Essential cookies:
                  </strong>{" "}
                  Required for core functionality such as authentication and
                  security.
                </li>
                <li>
                  <strong className="text-foreground">
                    Analytics cookies:
                  </strong>{" "}
                  Help us understand how visitors interact with our website so
                  we can improve the user experience.
                </li>
                <li>
                  <strong className="text-foreground">
                    Functional cookies:
                  </strong>{" "}
                  Remember your preferences, language settings, and other
                  customizations.
                </li>
                <li>
                  <strong className="text-foreground">
                    Marketing cookies:
                  </strong>{" "}
                  Used to deliver relevant advertisements and track campaign
                  performance.
                </li>
              </ul>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                You can control cookie preferences through your browser
                settings. Disabling certain cookies may limit your ability to
                use some features of our Services.
              </p>

              <h3 className="mt-6 text-xl font-medium">
                1.4 Voice and Call Data
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                As an AI voice agent platform, we may process voice recordings,
                transcriptions, and related metadata when you use our voice
                agent features. This data is processed to deliver the Services
                and improve voice agent performance. Call recordings and
                transcriptions are stored securely and retained according to
                your account settings and applicable law.
              </p>
            </div>

            {/* 2. How We Use Your Information */}
            <div>
              <h2 id="privacy-section-2" className="text-2xl font-semibold tracking-tight">
                2. How We Use Your Information
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                We use the information we collect for the following purposes:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
                <li>To provide, operate, and maintain our Services</li>
                <li>To create and manage your account</li>
                <li>
                  To process transactions and send billing-related
                  communications
                </li>
                <li>
                  To personalize and improve your experience with our platform
                </li>
                <li>To develop new features, products, and services</li>
                <li>
                  To analyze usage patterns and optimize platform performance
                </li>
                <li>
                  To train and improve our AI voice agent models using
                  aggregated and de-identified data
                </li>
                <li>
                  To communicate with you, including sending service updates,
                  security alerts, and support messages
                </li>
                <li>
                  To send marketing and promotional communications (with your
                  consent, where required by law)
                </li>
                <li>
                  To detect, prevent, and address fraud, abuse, and security
                  issues
                </li>
                <li>To comply with legal obligations and enforce our terms</li>
              </ul>
            </div>

            {/* 3. Data Sharing and Third Parties */}
            <div>
              <h2 id="privacy-section-3" className="text-2xl font-semibold tracking-tight">
                3. Data Sharing and Third Parties
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                We do not sell your personal information. We may share your
                information in the following circumstances:
              </p>

              <h3 className="mt-6 text-xl font-medium">
                3.1 Service Providers
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                We engage trusted third-party service providers to perform
                functions on our behalf, such as cloud hosting, payment
                processing, analytics, email delivery, and customer support.
                These providers have access to your information only to the
                extent necessary to perform their services and are contractually
                obligated to protect your data.
              </p>

              <h3 className="mt-6 text-xl font-medium">
                3.2 Business Transfers
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                In the event of a merger, acquisition, reorganization,
                bankruptcy, or sale of all or a portion of our assets, your
                information may be transferred as part of that transaction. We
                will notify you of any such change and any choices you may have
                regarding your information.
              </p>

              <h3 className="mt-6 text-xl font-medium">
                3.3 Legal Requirements
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                We may disclose your information if required to do so by law or
                in the good-faith belief that such action is necessary to comply
                with a legal obligation, protect and defend our rights or
                property, prevent fraud, or protect the personal safety of users
                or the public.
              </p>

              <h3 className="mt-6 text-xl font-medium">
                3.4 With Your Consent
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                We may share your information with third parties when you have
                given us explicit consent to do so.
              </p>

              <h3 className="mt-6 text-xl font-medium">
                3.5 Aggregated or De-Identified Data
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                We may share aggregated, anonymized, or de-identified data that
                cannot reasonably be used to identify you for research,
                analytics, benchmarking, or marketing purposes.
              </p>
            </div>

            {/* 4. Data Retention */}
            <div>
              <h2 id="privacy-section-4" className="text-2xl font-semibold tracking-tight">
                4. Data Retention
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                We retain your personal information for as long as your account
                is active or as needed to provide you with our Services. We may
                also retain and use your information as necessary to:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
                <li>Comply with our legal obligations</li>
                <li>Resolve disputes and enforce our agreements</li>
                <li>Maintain security and prevent fraud</li>
                <li>
                  Fulfill legitimate business purposes, such as analytics and
                  reporting
                </li>
              </ul>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                When your data is no longer required for these purposes, we will
                securely delete or anonymize it. Voice recordings and call
                transcriptions are retained based on your account configuration
                and are automatically purged after the retention period you set,
                unless a longer retention is required by law.
              </p>
            </div>

            {/* 5. Your Rights */}
            <div>
              <h2 id="privacy-section-5" className="text-2xl font-semibold tracking-tight">
                5. Your Rights
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Depending on your jurisdiction, you may have the following
                rights regarding your personal data:
              </p>

              <h3 className="mt-6 text-xl font-medium">
                5.1 Rights Under the General Data Protection Regulation (GDPR)
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                If you are located in the European Economic Area (EEA), the
                United Kingdom, or Switzerland, you have the right to:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Access</strong> — Request
                  a copy of the personal data we hold about you.
                </li>
                <li>
                  <strong className="text-foreground">Rectification</strong> —
                  Request correction of inaccurate or incomplete data.
                </li>
                <li>
                  <strong className="text-foreground">Erasure</strong> — Request
                  deletion of your personal data (&quot;right to be
                  forgotten&quot;).
                </li>
                <li>
                  <strong className="text-foreground">Restriction</strong> —
                  Request that we limit the processing of your data.
                </li>
                <li>
                  <strong className="text-foreground">Portability</strong> —
                  Receive your data in a structured, commonly used,
                  machine-readable format.
                </li>
                <li>
                  <strong className="text-foreground">Object</strong> — Object
                  to the processing of your data for certain purposes, including
                  direct marketing.
                </li>
                <li>
                  <strong className="text-foreground">Withdraw Consent</strong>{" "}
                  — Where processing is based on consent, withdraw that consent
                  at any time.
                </li>
              </ul>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                You also have the right to lodge a complaint with your local
                data protection authority.
              </p>

              <h3 className="mt-6 text-xl font-medium">
                5.2 Rights Under the California Consumer Privacy Act (CCPA)
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                If you are a California resident, you have the right to:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Know</strong> — Request
                  disclosure of the categories and specific pieces of personal
                  information we have collected about you.
                </li>
                <li>
                  <strong className="text-foreground">Delete</strong> — Request
                  deletion of the personal information we have collected from
                  you, subject to certain exceptions.
                </li>
                <li>
                  <strong className="text-foreground">Opt-Out of Sale</strong> —
                  We do not sell personal information. If this changes, you will
                  have the right to opt out.
                </li>
                <li>
                  <strong className="text-foreground">
                    Non-Discrimination
                  </strong>{" "}
                  — You will not be discriminated against for exercising your
                  privacy rights.
                </li>
              </ul>

              <h3 className="mt-6 text-xl font-medium">
                5.3 Exercising Your Rights
              </h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                To exercise any of the above rights, please contact us at{" "}
                <a
                  href="mailto:support@quickvoice.co"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  support@quickvoice.co
                </a>
                . We will respond to your request within the timeframe required
                by applicable law (typically 30 days for GDPR and 45 days for
                CCPA). We may need to verify your identity before processing
                your request.
              </p>
            </div>

            {/* 6. Security Measures */}
            <div>
              <h2 id="privacy-section-6" className="text-2xl font-semibold tracking-tight">
                6. Security Measures
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                We implement industry-standard technical and organizational
                security measures to protect your personal information against
                unauthorized access, alteration, disclosure, or destruction.
                These measures include:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
                <li>
                  Encryption of data in transit (TLS/SSL) and at rest (AES-256)
                </li>
                <li>Regular security assessments and penetration testing</li>
                <li>
                  Access controls and role-based permissions for internal
                  systems
                </li>
                <li>Secure software development practices</li>
                <li>Employee security awareness training</li>
                <li>Incident response and breach notification procedures</li>
              </ul>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                While we strive to protect your personal information, no method
                of transmission over the Internet or electronic storage is
                completely secure. We cannot guarantee absolute security, but we
                are committed to continually improving our safeguards.
              </p>
            </div>

            {/* 7. International Data Transfers */}
            <div>
              <h2 id="privacy-section-7" className="text-2xl font-semibold tracking-tight">
                7. International Data Transfers
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Your information may be transferred to, stored, and processed in
                countries other than your country of residence, including the
                United States and Canada. These countries may have data
                protection laws that differ from those in your jurisdiction.
                When we transfer data internationally, we implement appropriate
                safeguards, such as Standard Contractual Clauses (SCCs) approved
                by the European Commission, to ensure your data is protected in
                accordance with this Privacy Policy and applicable law.
              </p>
            </div>

            {/* 8. Children's Privacy */}
            <div>
              <h2 id="privacy-section-8" className="text-2xl font-semibold tracking-tight">
                8. Children&apos;s Privacy
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Our Services are not directed to individuals under the age of
                16. We do not knowingly collect personal information from
                children under 16. If we become aware that we have inadvertently
                collected personal data from a child under 16, we will take
                steps to delete that information as promptly as possible. If you
                believe that a child under 16 has provided us with personal
                information, please contact us at{" "}
                <a
                  href="mailto:support@quickvoice.co"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  support@quickvoice.co
                </a>
                .
              </p>
            </div>

            {/* 9. Third-Party Links */}
            <div>
              <h2 id="privacy-section-9" className="text-2xl font-semibold tracking-tight">
                9. Third-Party Links
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Our Services may contain links to third-party websites,
                applications, or services that are not operated by us. We are
                not responsible for the privacy practices of these third
                parties. We encourage you to review the privacy policies of any
                third-party services before providing them with your personal
                information.
              </p>
            </div>

            {/* 10. Changes to This Privacy Policy */}
            <div>
              <h2 id="privacy-section-10" className="text-2xl font-semibold tracking-tight">
                10. Changes to This Privacy Policy
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                We may update this Privacy Policy from time to time to reflect
                changes in our practices, technology, legal requirements, or
                other factors. When we make material changes, we will notify you
                by updating the &quot;Last updated&quot; date at the top of this
                page and, where required by law, by sending you an email
                notification or displaying a prominent notice on our website. We
                encourage you to review this Privacy Policy periodically to stay
                informed about how we protect your data.
              </p>
            </div>

            {/* 11. Contact Us */}
            <div>
              <h2 id="privacy-section-11" className="text-2xl font-semibold tracking-tight">
                11. Contact Us
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                If you have any questions, concerns, or requests regarding this
                Privacy Policy or our data practices, please contact us:
              </p>
              <div className="mt-6 rounded-xl border border-border bg-muted/30 p-6 sm:p-8">
                <p className="font-semibold text-foreground">QuickVoice</p>
                <p className="mt-1 text-muted-foreground">
                  Email:{" "}
                  <a
                    href="mailto:support@quickvoice.co"
                    className="text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    support@quickvoice.co
                  </a>
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      United States
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      104 West 40th Street, Suite 1800
                      <br />
                      New York, NY 10018
                      <br />
                      United States
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Canada
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      4000 Innovation Drive, 3rd Floor
                      <br />
                      Ottawa, Ontario K2K 3K1
                      <br />
                      Canada
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="page-section border-t border-border bg-muted/25">
        <div className="site-container !max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight">
            Have privacy or security questions before you deploy?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Book time with a QuickVoice specialist to review data handling,
            voice records, and compliance requirements for your use case.
          </p>
          <Link
            href={DEMO_BOOKING_URL}
            data-analytics-location="privacy-policy_footer"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Book a Demo
          </Link>
        </div>
      </section>
    </div>
  );
}
