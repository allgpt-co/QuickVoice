import type { Metadata } from "next";

import { GuideContentSection } from "@/components/landing/GuideContentSection";
import { RelatedPages } from "@/components/landing/related-pages";
import { getIndustryContent } from "@/lib/industries";
import {
  EducationHeroSection,
  EducationFeaturesSection,
  EducationEngagementSection,
  EducationBenefitsSection,
  EducationFaqSection,
  EducationCtaSection,
} from "@/components/landing/education";

export const metadata: Metadata = {
  title: "AI Voice Agents for Education & EdTech",
  description:
    "Explore AI phone-agent workflow patterns for enrollment support, student reminders, campus helpdesk, and administrative screening.",
  alternates: { canonical: "https://quickvoice.co/industries/education" },
  openGraph: {
    title: "AI Voice Agents for Education",
    description:
      "Automate enrollment, reminders, and student support for education with AI voice agents.",
    url: "https://quickvoice.co/industries/education",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Voice Agents for Education",
    description:
      "Automate enrollment, reminders, and student support for education with AI voice agents.",
    images: ["/og-image.png"],
  },
};

export default async function EducationPage() {
  const guideContent = getIndustryContent("education");

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "AI Voice Agents for Education & EdTech | QuickVoice",
    description:
      "Explore AI phone-agent workflow patterns for enrollment support, student reminders, campus helpdesk, and administrative screening.",
    url: "https://quickvoice.co/industries/education",
    mainEntity: {
      "@type": "WebApplication",
      name: "QuickVoice",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    breadcrumb: {
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
          name: "Industries",
          item: "https://quickvoice.co/industries",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Education",
          item: "https://quickvoice.co/industries/education",
        },
      ],
    },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How can AI Agents help EdTech companies improve student engagement?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "QuickVoice's AI Agents provide instant responses to student queries, share relevant course details, and send reminders for live classes, assignments, or exams\u2014keeping learners consistently engaged and informed.",
        },
      },
      {
        "@type": "Question",
        name: "Can QuickVoice assist with admission and onboarding processes?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. QuickVoice automates the entire admissions journey\u2014from answering FAQs, collecting documents, scheduling counselling calls, to sharing personalised course recommendations based on student goals.",
        },
      },
      {
        "@type": "Question",
        name: "Is QuickVoice suitable for both live and recorded learning platforms?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Absolutely. Whether it's a MOOC, hybrid model, or coaching institute, QuickVoice supports automated chat and voice interactions that cater to enrolment queries, course access issues, or technical troubleshooting.",
        },
      },
      {
        "@type": "Question",
        name: "How does AI support parent communication in K-12 EdTech?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "With QuickVoice, schools and learning platforms can send updates on student performance, fee reminders, or schedule changes via WhatsApp and chat, offering parents real-time, convenient support.",
        },
      },
      {
        "@type": "Question",
        name: "What integrations are supported for learning platforms?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "QuickVoice integrates with CRMs, LMS tools, payment gateways, and video conferencing platforms, allowing seamless data exchange to personalise and automate support journeys.",
        },
      },
      {
        "@type": "Question",
        name: "How do AI Agents reduce load on academic counsellors and support teams?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "By automating repetitive queries and triaging complex cases to human agents, QuickVoice helps EdTech companies scale without compromising on support quality\u2014especially during admission cycles or batch launches.",
        },
      },
      {
        "@type": "Question",
        name: "Can QuickVoice handle exam scheduling and academic calendar management?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. QuickVoice can automatically inform students about upcoming exams, class schedules, assignment deadlines, and academic events through multiple channels, ensuring no important information is missed.",
        },
      },
      {
        "@type": "Question",
        name: "How does QuickVoice support multilingual education platforms?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "QuickVoice supports multiple languages, making it ideal for international education platforms and institutions serving diverse student populations. It can provide localized support in students' preferred languages.",
        },
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <EducationHeroSection />
      <EducationFeaturesSection />
      <EducationEngagementSection />
      <EducationBenefitsSection />
      <EducationFaqSection />
      <EducationCtaSection />
      {guideContent && <GuideContentSection content={guideContent} />}
      <RelatedPages
        title="Related Solutions & Industries"
        pages={[
          {
            title: "Appointment Scheduling",
            href: "/use-cases/appointment-scheduling",
            description: "Automate enrollment and counseling session booking",
          },
          {
            title: "Customer Support",
            href: "/use-cases/customer-support",
            description: "AI-powered support for students and parents",
          },
          {
            title: "Reminders & Collections",
            href: "/use-cases/reminders-collections",
            description: "Automated fee reminders and student notifications",
          },
          {
            title: "Healthcare",
            href: "/industries/healthcare",
            description: "AI voice agents for healthcare organizations",
          },
        ]}
      />
    </div>
  );
}
