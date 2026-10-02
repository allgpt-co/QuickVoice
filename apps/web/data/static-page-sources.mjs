/**
 * Source files that determine when each static sitemap route last changed.
 * Paths are relative to the repository root. `scripts/update-static-page-dates.mjs`
 * reads this map, asks git for the last commit touching each route's sources,
 * and regenerates `static-page-dates.mjs`. Keep this list in sync with the
 * static routes in `apps/web/src/app/sitemap.ts`.
 */
const WEB = "apps/web";
const WORKFLOW_DATA = [
  `${WEB}/data/workflow-pages.ts`,
  `${WEB}/data/industry-workflows.ts`,
  `${WEB}/data/operational-workflows.ts`,
  `${WEB}/src/components/seo/workflow-page.tsx`,
];
const INFORMATION_DATA = [
  `${WEB}/data/marketing-information.ts`,
  `${WEB}/src/components/seo/information-page.tsx`,
];

const industrySources = (slug) => [
  `${WEB}/src/app/industries/${slug}`,
  `${WEB}/content/industries/${slug}.md`,
  ...WORKFLOW_DATA,
];
const workflowSources = (slug) => [
  `${WEB}/src/app/use-cases/${slug}`,
  `${WEB}/content/use-cases/${slug}.md`,
  ...WORKFLOW_DATA,
];

export const STATIC_PAGE_SOURCES = {
  "/": [`${WEB}/src/app/page.tsx`, `${WEB}/src/components/landing/business-home.tsx`],
  "/open-source": [`${WEB}/src/app/open-source`, `${WEB}/src/components/open-source`],
  "/resources": [`${WEB}/src/app/resources/page.tsx`, `${WEB}/public/resources`],
  "/resources/property-management-call-intake": [
    `${WEB}/src/app/resources/property-management-call-intake`,
    `${WEB}/data/property-management-resource.mjs`,
    `${WEB}/public/resources`,
  ],
  "/company/about-us": [`${WEB}/src/app/company/about-us`, ...INFORMATION_DATA],
  "/company/careers": [`${WEB}/src/app/company/careers`, ...INFORMATION_DATA],
  "/company/contact": [`${WEB}/src/app/company/contact`, ...INFORMATION_DATA],
  "/industries": [`${WEB}/src/app/industries/page.tsx`, ...INFORMATION_DATA],
  "/industries/automotive": industrySources("automotive"),
  "/industries/e-commerce": industrySources("e-commerce"),
  "/industries/education": industrySources("education"),
  "/industries/financial-services": industrySources("financial-services"),
  "/industries/healthcare": industrySources("healthcare"),
  "/industries/hr-recruiting": industrySources("hr-recruiting"),
  "/industries/logistics": industrySources("logistics"),
  "/industries/manufacturing-engineering": industrySources("manufacturing-engineering"),
  "/industries/real-estate": industrySources("real-estate"),
  "/industries/saas": industrySources("saas"),
  "/industries/travel-hospitality": industrySources("travel-hospitality"),
  "/use-cases": [`${WEB}/src/app/use-cases/page.tsx`, ...INFORMATION_DATA],
  "/use-cases/appointment-scheduling": workflowSources("appointment-scheduling"),
  "/use-cases/customer-support": workflowSources("customer-support"),
  "/use-cases/operations-automation": workflowSources("operations-automation"),
  "/use-cases/order-status-returns": workflowSources("order-status-returns"),
  "/use-cases/reminders-collections": workflowSources("reminders-collections"),
  "/use-cases/sales-lead-gen": workflowSources("sales-lead-gen"),
  "/blog": [`${WEB}/src/app/blog/page.tsx`, `${WEB}/src/lib/blog-discovery.mjs`, `${WEB}/content/blog`],
  "/case-studies": [`${WEB}/src/app/case-studies/page.tsx`, `${WEB}/content/case-studies`],
  "/pricing": [`${WEB}/src/app/pricing`, `${WEB}/src/components/pricing`, `${WEB}/data/plans.ts`],
  "/solutions": [`${WEB}/src/app/solutions/page.tsx`, ...INFORMATION_DATA],
  "/solutions/ai-receptionist": [`${WEB}/src/app/solutions/ai-receptionist`, ...WORKFLOW_DATA],
  "/solutions/ai-answering-service": [`${WEB}/src/app/solutions/ai-answering-service`, ...WORKFLOW_DATA],
  "/compliance/hipaa": [`${WEB}/src/app/compliance/hipaa`],
  "/privacy-policy": [`${WEB}/src/app/privacy-policy`],
  "/terms-of-service": [`${WEB}/src/app/terms-of-service`],
};
