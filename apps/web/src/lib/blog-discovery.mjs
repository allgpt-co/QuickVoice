export const BLOG_PAGE_SIZE = 12;

export const BLOG_TOPICS = [
  { id: "fundamentals", label: "Getting started", description: "Understand voice agents and plan a first evaluation." },
  { id: "workflows", label: "Workflow guides", description: "Plan reception, scheduling, support, and follow-up." },
  { id: "industries", label: "Industry guides", description: "Explore requirements for your business context." },
  { id: "costs", label: "Costs and ROI", description: "Define outcomes and compare the full cost of a workflow." },
  { id: "comparisons", label: "Comparisons", description: "Compare providers and the work your team will own." },
  { id: "implementation", label: "Implementation", description: "Review setup, integrations, and operating responsibilities." },
];

const CATEGORY_TOPICS = {
  "AI Voice Agent Education": "fundamentals",
  "Company Updates": "fundamentals",
  Guides: "fundamentals",
  "Use Case Guides": "workflows",
  "Use Case Deep Dives": "workflows",
  "Industry Guides": "industries",
  "Industry Playbooks": "industries",
  "ROI & Business Case": "costs",
  Comparisons: "comparisons",
  "How-To Guides": "implementation",
  "Implementation & How-To": "implementation",
  "Implementation Guides": "implementation",
};

/** A presentation taxonomy; article frontmatter and review fingerprints stay intact. */
export function getBlogTopic(post) {
  const id = CATEGORY_TOPICS[post.category] ?? "fundamentals";
  return BLOG_TOPICS.find((topic) => topic.id === id) ?? BLOG_TOPICS[0];
}

const first = (value) => typeof value === "string" ? value : Array.isArray(value) && typeof value[0] === "string" ? value[0] : "";

export function normalizeBlogFilters(params = {}) {
  const query = first(params.q).trim().slice(0, 120);
  const rawTopic = first(params.topic).trim();
  const topic = BLOG_TOPICS.find((item) => item.id === rawTopic)?.id ?? "";
  const rawPage = first(params.page).trim();
  const numericPage = Number(rawPage || "1");
  const invalidPage = Boolean(rawPage && (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(numericPage)));
  return {
    query,
    topic,
    invalidTopic: Boolean(rawTopic && !topic),
    requestedPage: invalidPage ? 1 : numericPage,
    invalidPage,
    isFiltered: Boolean(query || rawTopic),
  };
}

export function blogListingHref({ query = "", topic = "", page = 1 } = {}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (topic) params.set("topic", topic);
  if (page > 1) params.set("page", String(page));
  return `/blog${params.size ? `?${params}` : ""}`;
}

export function blogListingMetadata(params = {}) {
  const filters = normalizeBlogFilters(params);
  const canonicalPath = !filters.isFiltered && !filters.invalidPage
    ? blogListingHref({ page: filters.requestedPage })
    : "/blog";
  return {
    canonical: `https://quickvoice.co${canonicalPath}`,
    index: !filters.isFiltered && !filters.invalidPage,
  };
}

/** Call with published, reviewed posts only; this helper cannot approve content. */
export function getBlogListing(posts, params = {}) {
  const filters = normalizeBlogFilters(params);
  const terms = filters.query.toLocaleLowerCase("en-US").split(/\s+/).filter(Boolean);
  const filteredPosts = posts.filter((post) => {
    if (filters.invalidTopic || filters.topic && getBlogTopic(post).id !== filters.topic) return false;
    const text = [post.title, post.metaDescription, post.category, ...(post.tags ?? [])].join(" ").toLocaleLowerCase("en-US");
    return terms.every((term) => text.includes(term));
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || a.slug.localeCompare(b.slug));
  const pageCount = Math.max(1, Math.ceil(filteredPosts.length / BLOG_PAGE_SIZE));
  const outOfRange = filters.invalidPage || filters.requestedPage > pageCount;
  const start = (filters.requestedPage - 1) * BLOG_PAGE_SIZE;
  return {
    ...filters,
    filteredPosts,
    posts: outOfRange ? [] : filteredPosts.slice(start, start + BLOG_PAGE_SIZE),
    pageCount,
    total: filteredPosts.length,
    outOfRange,
    firstResult: filteredPosts.length && !outOfRange ? start + 1 : 0,
    lastResult: outOfRange ? 0 : Math.min(start + BLOG_PAGE_SIZE, filteredPosts.length),
  };
}

/** Prefer the same buyer topic and shared tags, with stable date/slug tie breaks. */
export function rankRelatedPosts(current, posts, limit = 3) {
  const currentTags = new Set((current.tags ?? []).map((tag) => tag.toLowerCase()));
  const score = (post) => (getBlogTopic(post).id === getBlogTopic(current).id ? 10 : 0)
    + (post.tags ?? []).filter((tag) => currentTags.has(tag.toLowerCase())).length;
  return posts.filter((post) => post.slug !== current.slug)
    .sort((a, b) => score(b) - score(a) || new Date(b.date).getTime() - new Date(a.date).getTime() || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}
