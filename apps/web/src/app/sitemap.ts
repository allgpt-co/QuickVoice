import type { MetadataRoute } from "next";
import { getIndexablePosts, getPostModifiedDate } from "@/lib/blog";

export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://quickvoice.co";

  const posts = getIndexablePosts();

  const blogUrls: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(getPostModifiedDate(post)),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const staticPages: MetadataRoute.Sitemap = [
    // Homepage
    {
      url: baseUrl,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/open-source`,
      changeFrequency: "weekly",
      priority: 0.9,
    },

    // Company pages
    {
      url: `${baseUrl}/company/about-us`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/company/careers`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/company/contact`,
      changeFrequency: "monthly",
      priority: 0.6,
    },

    // Industries hub
    {
      url: `${baseUrl}/industries`,
      changeFrequency: "weekly",
      priority: 0.9,
    },

    // Industry pages
    ...[
      "automotive",
      "e-commerce",
      "education",
      "financial-services",
      "healthcare",
      "hr-recruiting",
      "logistics",
      "manufacturing-engineering",
      "real-estate",
      "saas",
      "travel-hospitality",
    ].map((slug) => ({
      url: `${baseUrl}/industries/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),

    // Use cases hub
    {
      url: `${baseUrl}/use-cases`,
      changeFrequency: "weekly",
      priority: 0.9,
    },

    // Use case pages
    ...[
      "appointment-scheduling",
      "customer-support",
      "operations-automation",
      "order-status-returns",
      "reminders-collections",
      "sales-lead-gen",
    ].map((slug) => ({
      url: `${baseUrl}/use-cases/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),

    // Blog index
    {
      url: `${baseUrl}/blog`,
      changeFrequency: "weekly",
      priority: 0.8,
    },

    // Case studies hub
    {
      url: `${baseUrl}/case-studies`,
      changeFrequency: "weekly",
      priority: 0.8,
    },

    // Pricing
    {
      url: `${baseUrl}/pricing`,
      changeFrequency: "weekly",
      priority: 0.9,
    },

    // Solutions
    {
      url: `${baseUrl}/solutions`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/solutions/ai-receptionist`,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/solutions/ai-answering-service`,
      changeFrequency: "monthly",
      priority: 0.9,
    },

    // Compliance
    {
      url: `${baseUrl}/compliance/hipaa`,
      changeFrequency: "monthly",
      priority: 0.8,
    },

    // Legal pages
    {
      url: `${baseUrl}/privacy-policy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms-of-service`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // Illustrative case studies remain noindex until customer evidence is available.
  return [...staticPages, ...blogUrls];
}
