"use client";

import {
  Facebook,
  Instagram,
  Mail,
  MapPin,
  Phone,
  Twitter,
} from "lucide-react";
import Link from "next/link";
import Logo1 from "../logo1";
import {
  GITHUB_DOCS_URL,
  GITHUB_ISSUES_URL,
  GITHUB_RELEASES_URL,
  GITHUB_REPO_URL,
} from "@/lib/links";

const data = {
  facebookLink: "https://www.facebook.com/profile.php?id=61578373598223",
  instaLink: "https://www.instagram.com/quickvoice_co/",
  twitterLink: "https://x.com/QuickVoice_co",
  services: {
    industries: "/industries",
    useCases: "/use-cases",
  },
  about: {
    aboutUs: "/company/about-us",
    contactUs: "/company/contact",
    careers: "/company/careers",
  },
  contact: {
    email: "info@quickvoice.co",
    phone: "+1 2184525998",
    address: "Delaware, United States",
  },
  company: {
    name: "QuickVoice",
    description:
      "Open-source, self-hostable infrastructure for building and operating AI phone agents.",
    logo: "/logo.webp",
  },
};

const socialLinks = [
  { icon: Facebook, label: "Facebook", href: data.facebookLink },
  { icon: Instagram, label: "Instagram", href: data.instaLink },
  { icon: Twitter, label: "X (Twitter)", href: data.twitterLink },
];

const aboutLinks = [
  { text: "About Us", href: data.about.aboutUs },
  { text: "Contact Us", href: data.about.contactUs },
  { text: "Careers", href: data.about.careers },
  { text: "Privacy Policy", href: "/privacy-policy" },
  { text: "Terms of Service", href: "/terms-of-service" },
];

const serviceLinks = [
  { text: "Industries", href: data.services.industries },
  { text: "Use Cases", href: data.services.useCases },
  { text: "Pricing", href: "/pricing" },
  { text: "Blog", href: "/blog" },
  { text: "Workflow Scenarios", href: "/case-studies" },
];

const projectLinks = [
  { text: "Open Source", href: "/open-source" },
  { text: "GitHub", href: GITHUB_REPO_URL },
  { text: "Documentation", href: GITHUB_DOCS_URL },
  { text: "Issues", href: GITHUB_ISSUES_URL },
  { text: "Releases", href: GITHUB_RELEASES_URL },
];

const contactInfo = [
  { icon: Mail, text: data.contact.email },
  { icon: Phone, text: data.contact.phone },
  { icon: MapPin, text: data.contact.address, isAddress: true },
];

export default function Footer4Col() {
  return (
    <footer className="bg-secondary dark:bg-secondary/20 mt-16 w-full place-self-end rounded-t-xl">
      <div className="mx-auto max-w-screen-xl px-4 pt-16 pb-6 sm:px-6 lg:px-8 lg:pt-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div>
            <div className="text-primary flex justify-center items-center gap-2 sm:justify-start">
              <Logo1 />
            </div>

            <p className="text-foreground/50 mt-6 max-w-md text-center leading-relaxed sm:max-w-xs sm:text-left">
              {data.company.description}
            </p>

            <ul className="mt-8 flex items-center justify-center gap-6 sm:justify-start md:gap-8">
              {socialLinks.map(({ icon: Icon, label, href }) => (
                <li key={label} className="flex items-center">
                  <Link
                    target="_blank"
                    rel="noopener noreferrer"
                    href={href}
                    className="flex items-center justify-center text-primary hover:text-primary/80 transition"
                  >
                    <span className="sr-only">{label}</span>
                    <Icon className="size-6" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4">
            <div className="text-center sm:text-left">
              <p className="text-lg font-medium">About Us</p>
              <ul className="mt-8 space-y-4 text-sm">
                {aboutLinks.map(({ text, href }) => (
                  <li key={text}>
                    <Link
                      className="text-secondary-foreground/70 transition-colors hover:text-foreground"
                      href={href}
                    >
                      {text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-center sm:text-left">
              <p className="text-lg font-medium">Solutions</p>
              <ul className="mt-8 space-y-4 text-sm">
                {serviceLinks.map(({ text, href }) => (
                  <li key={text}>
                    <Link
                      className="text-secondary-foreground/70 transition-colors hover:text-foreground"
                      href={href}
                    >
                      {text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-center sm:text-left">
              <p className="text-lg font-medium">Open Source</p>
              <ul className="mt-8 space-y-4 text-sm">
                {projectLinks.map(({ text, href }) => (
                  <li key={text}>
                    {href.startsWith("http") ? (
                      <a
                        className="text-secondary-foreground/70 transition-colors hover:text-foreground"
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        data-analytics-location="footer"
                      >
                        {text}
                      </a>
                    ) : (
                      <Link
                        className="text-secondary-foreground/70 transition-colors hover:text-foreground"
                        href={href}
                      >
                        {text}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="text-center sm:text-left">
              <p className="text-lg font-medium">Contact Us</p>
              <ul className="mt-8 space-y-4 text-sm">
                {contactInfo.map(({ icon: Icon, text, isAddress }) => {
                  const isEmail = text.includes("@");
                  const isPhone = text.includes("+") || /^\d/.test(text);
                  const href = isEmail
                    ? `mailto:${text}`
                    : isPhone
                      ? `tel:${text}`
                      : "#";

                  return (
                    <li key={text}>
                      {isEmail || isPhone ? (
                        <Link
                          className="flex items-center justify-center gap-1.5 sm:justify-start"
                          href={href}
                        >
                          <Icon className="text-primary size-5 shrink-0 shadow-sm" />
                          {isAddress ? (
                            <address className="text-secondary-foreground/70 -mt-0.5 flex-1 not-italic transition">
                              {text}
                            </address>
                          ) : (
                            <span className="text-secondary-foreground/70 flex-1 transition">
                              {text}
                            </span>
                          )}
                        </Link>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 sm:justify-start">
                          <Icon className="text-primary size-5 shrink-0 shadow-sm" />
                          {isAddress ? (
                            <address className="text-secondary-foreground/70 -mt-0.5 flex-1 not-italic transition">
                              {text}
                            </address>
                          ) : (
                            <span className="text-secondary-foreground/70 flex-1 transition">
                              {text}
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t pt-6">
          <p className="text-center text-sm text-secondary-foreground/70">
            &copy; {new Date().getFullYear()} QuickVoice contributors. MIT
            licensed.
          </p>
        </div>
      </div>
    </footer>
  );
}
