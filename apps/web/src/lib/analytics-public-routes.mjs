// Exact public pages, not namespace patterns: an unknown blog/solution slug is a 404.
export const STATIC_ANALYTICS_PATHS = Object.freeze([
  "/", "/blog", "/case-studies", "/pricing", "/open-source", "/resources",
  "/resources/property-management-call-intake",
  "/company/about-us", "/company/careers", "/company/contact",
  "/industries", "/industries/automotive", "/industries/e-commerce",
  "/industries/education", "/industries/financial-services", "/industries/healthcare",
  "/industries/hr-recruiting", "/industries/logistics", "/industries/manufacturing-engineering",
  "/industries/real-estate", "/industries/saas", "/industries/travel-hospitality",
  "/use-cases", "/use-cases/appointment-scheduling", "/use-cases/customer-support",
  "/use-cases/operations-automation", "/use-cases/order-status-returns",
  "/use-cases/reminders-collections", "/use-cases/sales-lead-gen",
  "/solutions", "/solutions/ai-receptionist", "/solutions/ai-answering-service",
  "/compliance/hipaa", "/privacy-policy", "/terms-of-service",
]);

/** Slugs must come from the same published-content readers used by the pages.
 * Noindex public content is still public; future/draft/unknown posts are excluded.
 * @param {string[]} blogSlugs
 * @param {string[]} caseStudySlugs
 */
export function createPublicAnalyticsPaths(blogSlugs = [], caseStudySlugs = []) {
  const paths = [...STATIC_ANALYTICS_PATHS];
  for (const [prefix, slugs] of [["/blog", blogSlugs], ["/case-studies", caseStudySlugs]]) {
    for (const slug of slugs) {
      if (typeof slug === "string" && slug.length <= 180 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        paths.push(`${prefix}/${slug}`);
      }
    }
  }
  return [...new Set(paths)];
}
