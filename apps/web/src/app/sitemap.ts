import type { MetadataRoute } from "next";
import { getIndexablePosts, getPostModifiedDate } from "@/lib/blog";
import { STATIC_PAGE_LAST_MODIFIED } from "@/data/static-page-dates.mjs";

export const revalidate = 3600;

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

type StaticRoute = {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
};

const INDUSTRY_SLUGS = [
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
];

const USE_CASE_SLUGS = [
  "appointment-scheduling",
  "customer-support",
  "operations-automation",
  "order-status-returns",
  "reminders-collections",
  "sales-lead-gen",
];

/**
 * Static routes in the public sitemap. Illustrative case-study details and
 * unreviewed articles stay out. Each route's <lastmod> comes from
 * `apps/web/data/static-page-dates.mjs` (regenerate with
 * `node scripts/update-static-page-dates.mjs` before a release).
 */
const STATIC_ROUTES: StaticRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/open-source", changeFrequency: "weekly", priority: 0.9 },
  { path: "/resources", changeFrequency: "monthly", priority: 0.8 },
  {
    path: "/resources/property-management-call-intake",
    changeFrequency: "monthly",
    priority: 0.8,
  },

  // Company pages
  { path: "/company/about-us", changeFrequency: "monthly", priority: 0.6 },
  { path: "/company/careers", changeFrequency: "monthly", priority: 0.5 },
  { path: "/company/contact", changeFrequency: "monthly", priority: 0.6 },

  // Industries
  { path: "/industries", changeFrequency: "weekly", priority: 0.9 },
  ...INDUSTRY_SLUGS.map((slug) => ({
    path: `/industries/${slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  })),

  // Use cases
  { path: "/use-cases", changeFrequency: "weekly", priority: 0.9 },
  ...USE_CASE_SLUGS.map((slug) => ({
    path: `/use-cases/${slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  })),

  // Hubs
  { path: "/blog", changeFrequency: "weekly", priority: 0.8 },
  { path: "/case-studies", changeFrequency: "weekly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },

  // Solutions
  { path: "/solutions", changeFrequency: "weekly", priority: 0.9 },
  { path: "/solutions/ai-receptionist", changeFrequency: "monthly", priority: 0.9 },
  {
    path: "/solutions/ai-answering-service",
    changeFrequency: "monthly",
    priority: 0.9,
  },

  // Compliance and legal
  { path: "/compliance/hipaa", changeFrequency: "monthly", priority: 0.8 },
  { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms-of-service", changeFrequency: "yearly", priority: 0.3 },
];

function recordedModificationDate(path: string): Date | undefined {
  const recorded = (STATIC_PAGE_LAST_MODIFIED as Record<string, string>)[path];
  if (!recorded) return undefined;
  const date = new Date(recorded);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://quickvoice.co";

  const staticPages: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => {
    const lastModified = recordedModificationDate(route.path);
    return {
      // Search Console reports the homepage canonical as "https://quickvoice.co/";
      // emit that form so the sitemap and the inspection report agree. (Next's
      // metadata resolver strips the trailing slash from the page canonical; the
      // two forms are URL-equivalent.)
      url: `${baseUrl}${route.path}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    };
  });

  const blogUrls: MetadataRoute.Sitemap = getIndexablePosts().map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(getPostModifiedDate(post)),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...blogUrls];
}
