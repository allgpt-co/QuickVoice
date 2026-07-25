import { getAllPosts, type BlogPost } from "@/lib/blog";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Calendar,
  Clock,
  ChevronRight,
  BookOpen,
  TrendingUp,
  Layers,
  BarChart2,
  GitCompare,
  Building2,
  Search,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Blog — AI Voice Agent Guides & Insights",
  description:
    "Editorial guides on AI phone agents, architecture, workflow design, industry considerations, and evaluation. Verify cited sources before relying on a claim.",
  alternates: { canonical: "https://quickvoice.co/blog" },
  openGraph: {
    title: "QuickVoice Blog — AI Voice Agent Insights",
    description:
      "Editorial guides on AI phone agents, architecture, workflow design, industry considerations, and evaluation.",
    type: "website",
    url: "https://quickvoice.co/blog",
    siteName: "QuickVoice",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "QuickVoice Blog — AI Voice Agent Insights",
    description:
      "Editorial guides on AI phone agents, architecture, workflow design, industry considerations, and evaluation.",
    images: ["/og-image.png"],
  },
};

const CATEGORY_META: Record<
  string,
  { color: string; bg: string; icon: React.ReactNode; description: string }
> = {
  "AI Voice Agent Education": {
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    icon: <BookOpen className="h-4 w-4" />,
    description: "Fundamentals and deep-dives into AI voice technology",
  },
  "How-To Guides": {
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    icon: <Layers className="h-4 w-4" />,
    description: "Step-by-step tutorials for deploying AI voice",
  },
  "Industry Playbooks": {
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    icon: <Building2 className="h-4 w-4" />,
    description: "Vertical-specific deployment strategies",
  },
  "ROI & Business Case": {
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    icon: <BarChart2 className="h-4 w-4" />,
    description: "Cost analysis, savings models and ROI data",
  },
  Comparisons: {
    color: "text-rose-500",
    bg: "bg-rose-500/10",
    icon: <GitCompare className="h-4 w-4" />,
    description: "Head-to-head platform comparisons",
  },
  "Company Updates": {
    color: "text-slate-400",
    bg: "bg-slate-400/10",
    icon: <TrendingUp className="h-4 w-4" />,
    description: "Product news, roadmap and milestones",
  },
};

function defaultMeta(cat: string) {
  return {
    color: "text-primary",
    bg: "bg-primary/10",
    icon: <BookOpen className="h-4 w-4" />,
    description: cat,
  };
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function normalizeSearchQuery(value: string | string[] | undefined): string {
  const query = Array.isArray(value) ? value[0] : value;
  return query?.trim().slice(0, 120) ?? "";
}

function getCategories(posts: BlogPost[]): string[] {
  return Array.from(new Set(posts.map((post) => post.category)));
}

function postMatchesQuery(post: BlogPost, query: string): boolean {
  const normalizedQuery = query.toLowerCase();
  const searchableText = [
    post.title,
    post.metaDescription,
    post.category,
    post.readTime,
    ...post.tags,
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
}

interface BlogIndexPageProps {
  searchParams?: Promise<{ q?: string | string[] }> | { q?: string | string[] };
}

export default async function BlogIndexPage({
  searchParams,
}: BlogIndexPageProps) {
  const params = searchParams ? await searchParams : {};
  const query = normalizeSearchQuery(params.q);
  const allPosts = getAllPosts();
  const filteredPosts = query
    ? allPosts.filter((post) => postMatchesQuery(post, query))
    : allPosts;
  const categories = getCategories(filteredPosts);
  const featured = filteredPosts[filteredPosts.length - 1]; // most recent

  const blogSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "QuickVoice Blog — AI Voice Agent Insights, Guides & Industry News",
    description:
      "Expert articles on AI voice agents, no-code deployment, industry playbooks, ROI analysis, and the latest in conversational AI.",
    url: "https://quickvoice.co/blog",
    publisher: {
      "@type": "Organization",
      name: "QuickVoice",
      url: "https://quickvoice.co",
      logo: { "@type": "ImageObject", url: "https://quickvoice.co/logo.svg" },
    },
  };

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
        name: "Blog",
        item: "https://quickvoice.co/blog",
      },
    ],
  };

  return (
    <main className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([blogSchema, breadcrumbSchema]),
        }}
      />
      {/* Hero */}
      <section className="relative overflow-hidden pt-28 pb-16 px-4">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-blue-600/5" />
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm text-primary mb-6">
              <BookOpen className="h-3.5 w-3.5" />
              <span>{allPosts.length} expert articles and growing</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-5 leading-tight">
              AI Voice Agent Insights,
              <br />
              <span className="text-primary">Guides & Playbooks</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Deep-dive articles on deploying AI voice agents, industry ROI
              data, comparison guides, and practical how-tos — written by
              practitioners, for business operators.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-24">
        <section className="mb-12">
          <form
            action="/blog"
            className="mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row"
          >
            <label htmlFor="blog-search" className="sr-only">
              Search blog articles
            </label>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="blog-search"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search guides, playbooks, and comparisons"
                className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Search
            </button>
            {query && (
              <Link
                href="/blog"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                Clear
              </Link>
            )}
          </form>
          {query && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Showing {filteredPosts.length}{" "}
              {filteredPosts.length === 1 ? "article" : "articles"} for &quot;
              {query}&quot;.
            </p>
          )}
        </section>

        {/* Featured post */}
        {featured && (
          <section className="mb-16">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-6">
              Latest Article
            </h2>
            <Link href={`/blog/${featured.slug}`} className="group block">
              <div className="rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 overflow-hidden">
                <div className="grid md:grid-cols-2 gap-0">
                  <div className="p-8 md:p-10 flex flex-col justify-between">
                    <div>
                      {/* Category badge */}
                      <div
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium mb-4 ${
                          (
                            CATEGORY_META[featured.category] ||
                            defaultMeta(featured.category)
                          ).bg
                        } ${(CATEGORY_META[featured.category] || defaultMeta(featured.category)).color}`}
                      >
                        {
                          (
                            CATEGORY_META[featured.category] ||
                            defaultMeta(featured.category)
                          ).icon
                        }
                        {featured.category}
                      </div>
                      <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-4 group-hover:text-primary transition-colors leading-snug">
                        {featured.title}
                      </h3>
                      <p className="text-muted-foreground leading-relaxed line-clamp-3">
                        {featured.metaDescription}
                      </p>
                    </div>
                    <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(featured.date)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {featured.readTime}
                      </span>
                      <span className="ml-auto flex items-center gap-1 font-medium text-primary group-hover:gap-2 transition-all">
                        Read article <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                  <div className="hidden md:flex items-center justify-center bg-gradient-to-br from-primary/10 to-blue-600/10 p-10">
                    <div className="text-center space-y-3">
                      <div className="text-6xl font-bold text-primary/20">
                        {query ? filteredPosts.length : allPosts.length}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {query ? "matching articles" : "articles published"}
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center mt-4">
                        {featured.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-1 rounded-full bg-background border border-border text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </section>
        )}

        {filteredPosts.length === 0 && (
          <section className="mb-16 rounded-2xl border border-border bg-card p-10 text-center">
            <h2 className="text-xl font-bold text-foreground">
              No articles found
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Try a broader keyword or clear the search to browse every
              published QuickVoice guide.
            </p>
          </section>
        )}

        {/* Category sections */}
        {categories.map((category) => {
          const meta = CATEGORY_META[category] || defaultMeta(category);
          const posts = filteredPosts.filter((p) => p.category === category);
          return (
            <section key={category} className="mb-16">
              {/* Section header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${meta.bg} ${meta.color}`}>
                    {meta.icon}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">
                      {category}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {meta.description}
                    </p>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground hidden sm:block">
                  {posts.length} {posts.length === 1 ? "article" : "articles"}
                </span>
              </div>

              {/* Post grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {posts.map((post) => (
                  <Link
                    key={post.slug}
                    href={`/blog/${post.slug}`}
                    className="group block rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all duration-200 overflow-hidden"
                  >
                    <div className="p-6 flex flex-col h-full">
                      {/* Category pill */}
                      <div
                        className={`inline-flex items-center self-start gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium mb-3 ${meta.bg} ${meta.color}`}
                      >
                        {meta.icon}
                        {category}
                      </div>

                      {/* Title */}
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 text-base leading-snug mb-2">
                        {post.title}
                      </h3>

                      {/* Excerpt */}
                      <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed flex-1">
                        {post.metaDescription}
                      </p>

                      {/* Footer */}
                      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(post.date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {post.readTime}
                          </span>
                        </div>
                        <span className="flex items-center gap-0.5 text-primary font-medium group-hover:gap-1.5 transition-all text-xs">
                          Read <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {/* Bottom CTA */}
        <section className="mt-8 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-blue-600/5 p-10 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-3">
            Ready to inspect the implementation?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Separate editorial ideas from code-backed capabilities, then review
            the setup prerequisites and provider boundaries in the open-source
            repository.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/open-source"
              className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3 font-medium text-white transition-all hover:shadow-lg"
              style={{
                backgroundImage:
                  "linear-gradient(to right, var(--primary), #1e40af)",
              }}
            >
              Explore the open-source stack
            </Link>
            <Link
              href="/company/contact"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-7 py-3 font-medium text-foreground hover:bg-muted transition-all"
            >
              Book a Demo
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
