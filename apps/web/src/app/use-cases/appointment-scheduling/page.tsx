import type { Metadata } from "next";

import { GuideContentSection } from "@/components/landing/GuideContentSection";
import { RelatedPages } from "@/components/landing/related-pages";
import { getUseCaseContent } from "@/lib/industries";
import {
  AppointmentSchedulingHeroSection,
  AppointmentSchedulingFeaturesSection,
  AppointmentSchedulingJourneySection,
  AppointmentSchedulingVoiceSection,
  AppointmentSchedulingIntegrationsSection,
  AppointmentSchedulingIndustriesSection,
  AppointmentSchedulingFaqSection,
  AppointmentSchedulingCtaSection,
} from "@/components/landing/appointment-scheduling";

export const metadata: Metadata = {
  title: "AI Appointment Scheduling Voice Agents",
  description:
    "Automate appointment booking, reminders, and rescheduling with AI voice agents. Reduce no-shows by 30%. No coding required. Free trial.",
  alternates: {
    canonical: "https://quickvoice.co/use-cases/appointment-scheduling",
  },
  openGraph: {
    title: "AI Appointment Scheduling Voice Agents | QuickVoice",
    description:
      "Automate appointment booking, reminders, and rescheduling with AI voice agents. Reduce no-shows by 30%.",
    url: "https://quickvoice.co/use-cases/appointment-scheduling",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Appointment Scheduling Voice Agents | QuickVoice",
    description:
      "Automate appointment booking and reminders with AI voice agents.",
    images: ["/og-image.png"],
  },
};

export default async function AppointmentSchedulingPage() {
  const guideContent = getUseCaseContent("appointment-scheduling");

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
        name: "Use Cases",
        item: "https://quickvoice.co/use-cases",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Appointment Scheduling",
        item: "https://quickvoice.co/use-cases/appointment-scheduling",
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <AppointmentSchedulingHeroSection />
      <AppointmentSchedulingFeaturesSection />
      <AppointmentSchedulingJourneySection />
      <AppointmentSchedulingVoiceSection />
      <AppointmentSchedulingIntegrationsSection />
      <AppointmentSchedulingIndustriesSection />
      <AppointmentSchedulingFaqSection />
      <AppointmentSchedulingCtaSection />
      {guideContent && <GuideContentSection content={guideContent} />}
      <RelatedPages
        title="Related Solutions"
        pages={[
          {
            title: "Reminders & Collections",
            href: "/use-cases/reminders-collections",
            description: "Automated reminders and payment follow-ups",
          },
          {
            title: "Customer Support",
            href: "/use-cases/customer-support",
            description: "AI-powered customer support automation",
          },
          {
            title: "Healthcare",
            href: "/industries/healthcare",
            description: "AI voice agents for healthcare",
          },
          {
            title: "Education",
            href: "/industries/education",
            description: "AI voice agents for education",
          },
        ]}
      />
    </div>
  );
}
