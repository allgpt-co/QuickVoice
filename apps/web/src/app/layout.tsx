import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";

import type { Metadata } from "next";
import Navbar from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { CtaAnalytics } from "@/components/cta-analytics";
import { GoogleAnalytics } from "@/components/google-analytics";
import {
  createGoogleAnalyticsScript,
  manualPageviewsEnabled,
} from "@/lib/google-analytics-config.mjs";
const inter = Inter({ subsets: ["latin"], display: "swap" });

const manualPageviews = manualPageviewsEnabled(
  process.env.NEXT_PUBLIC_GA_MANUAL_PAGEVIEWS,
);
const googleAnalyticsScript = createGoogleAnalyticsScript(
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  manualPageviews,
);

export const metadata: Metadata = {
  metadataBase: new URL("https://quickvoice.co"),
  title: {
    default: "QuickVoice - Open-Source AI Phone Agent Stack",
    template: "%s | QuickVoice",
  },
  description:
    "Run, inspect, and extend the QuickVoice stack for AI phone agents, including the console, API, LiveKit worker, telephony integrations, knowledge bases, campaigns, and call logs.",
  keywords: [
    "AI voice agents",
    "open-source voice AI",
    "AI voice automation",
    "self-hosted voice agents",
    "voice agent platform",
    "conversational AI",
  ],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "QuickVoice",
    title: "QuickVoice - Open-Source AI Phone Agent Stack",
    description:
      "Run, inspect, and extend the QuickVoice stack for AI phone agents, including the console, API, LiveKit worker, telephony integrations, knowledge bases, campaigns, and call logs.",
    images: [
      {
        url: "/logo.svg",
        width: 512,
        height: 512,
        alt: "QuickVoice Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "QuickVoice - Open-Source AI Phone Agent Stack",
    description:
      "Run, inspect, and extend the QuickVoice stack for AI phone agents.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="alternate"
          type="text/plain"
          href="/llms.txt"
          title="LLM Information"
        />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        {process.env.NEXT_PUBLIC_GSC_VERIFICATION && (
          <meta
            name="google-site-verification"
            content={process.env.NEXT_PUBLIC_GSC_VERIFICATION}
          />
        )}
      </head>
      <body className={inter.className}>
        {googleAnalyticsScript && (
          <Suspense fallback={null}>
            <GoogleAnalytics
              script={googleAnalyticsScript}
              configuredId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? ""}
              manualPageviews={manualPageviews}
            />
          </Suspense>
        )}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white focus:text-sm focus:font-semibold focus:shadow-lg"
        >
          Skip to main content
        </a>
        <Navbar />
        <CtaAnalytics />
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
