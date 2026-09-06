import { getPostBySlug, getAllSlugs, getRelatedPosts, isIndexablePost, getPostModifiedDate } from "@/lib/blog";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import { EvidenceStatusNotice } from "@/components/evidence-status-notice";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Clock,
  User,
  ChevronRight,
  Tag,
  ArrowLeft,
  BookOpen,
  BarChart2,
  Layers,
  Building2,
  GitCompare,
  TrendingUp,
} from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 3600;
export const dynamic = "force-static";

export async function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: { absolute: post.metaTitle || post.title },
    description: post.metaDescription,
    alternates: { canonical: post.canonical },
    robots: {
      index: isIndexablePost(post),
      follow: true,
    },
    openGraph: {
      title: post.metaTitle || post.title,
      description: post.metaDescription,
      type: "article",
      publishedTime: post.date,
      modifiedTime: getPostModifiedDate(post),
      authors: [post.author],
      tags: post.tags,
      url: `https://quickvoice.co/blog/${slug}`,
      siteName: "QuickVoice",
      images: [
        {
          url: post.ogImage || "/og-image.png",
          width: 1200,
          height: 630,
          alt: post.metaTitle || post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.metaTitle || post.title,
      description: post.metaDescription,
      images: [post.ogImage || "/og-image.png"],
    },
  };
}

const CATEGORY_META: Record<
  string,
  { color: string; bg: string; icon: React.ReactNode }
> = {
  "AI Voice Agent Education": {
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    icon: <BookOpen className="h-3.5 w-3.5" />,
  },
  "How-To Guides": {
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    icon: <Layers className="h-3.5 w-3.5" />,
  },
  "Industry Playbooks": {
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    icon: <Building2 className="h-3.5 w-3.5" />,
  },
  "ROI & Business Case": {
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    icon: <BarChart2 className="h-3.5 w-3.5" />,
  },
  Comparisons: {
    color: "text-rose-500",
    bg: "bg-rose-500/10",
    icon: <GitCompare className="h-3.5 w-3.5" />,
  },
  "Company Updates": {
    color: "text-slate-400",
    bg: "bg-slate-400/10",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
  },
};

function defaultMeta() {
  return {
    color: "text-primary",
    bg: "bg-primary/10",
    icon: <BookOpen className="h-3.5 w-3.5" />,
  };
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const relatedPosts = getRelatedPosts(slug, 3);
  const meta = CATEGORY_META[post.category] || defaultMeta();
  const indexable = isIndexablePost(post);
  const modifiedDate = getPostModifiedDate(post);

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.metaTitle || post.title,
    description: post.metaDescription,
    author: {
      "@type": "Person",
      name: post.author,
    },
    publisher: {
      "@type": "Organization",
      name: "QuickVoice",
      url: "https://quickvoice.co",
      logo: {
        "@type": "ImageObject",
        url: "https://quickvoice.co/logo.svg",
      },
    },
    datePublished: post.date,
    dateModified: modifiedDate,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://quickvoice.co/blog/${post.slug}`,
    },
    image: new URL(post.ogImage || "/og-image.png", "https://quickvoice.co").href,
    url: `https://quickvoice.co/blog/${post.slug}`,
    keywords: post.tags.join(", "),
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
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: `https://quickvoice.co/blog/${post.slug}`,
      },
    ],
  };

  return (
    <main className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(indexable ? [articleSchema, breadcrumbSchema] : [breadcrumbSchema]).replace(/</g, "\\u003c"),
        }}
      />
      {/* Top bar */}
      <div className="border-b border-border bg-background/80 backdrop-blur sticky top-16 z-40">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link
            href="/blog"
            className="hover:text-foreground transition-colors"
          >
            Blog
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className={`${meta.color} font-medium`}>{post.category}</span>
          <ChevronRight className="h-3.5 w-3.5 hidden sm:block" />
          <span className="hidden sm:block text-foreground truncate max-w-xs">
            {post.title}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-10 pb-24">
        <div className="grid lg:grid-cols-[1fr_300px] gap-12 items-start">
          {/* Main content */}
          <article className="min-w-0">
            {/* Back link */}
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-8"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to all articles
            </Link>

            {/* Article header */}
            <header className="mb-10">
              {/* Category */}
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium mb-4 ${meta.bg} ${meta.color}`}
              >
                {meta.icon}
                {post.category}
              </div>

              {/* Title */}
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-5">
                {post.title}
              </h1>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pb-6 border-b border-border">
                <span className="flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  {post.author}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {formatDate(post.date)}
                </span>
                {modifiedDate !== post.date && (
                  <span>Updated {formatDate(modifiedDate)}</span>
                )}
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  {post.readTime} read
                </span>
              </div>

              {/* Tags */}
              {post.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </header>

            {!indexable && <div className="mb-10">
              <EvidenceStatusNotice title="Editorial content under evidence review">
                <p>
                  This article may contain third-party statistics, illustrative
                  calculations, example organizations, or product claims that
                  have not yet passed the public claims gate. Verify original
                  sources and current product behavior before relying on it for
                  a buying, compliance, launch, or implementation decision.
                </p>
              </EvidenceStatusNotice>
            </div>}

            {/* Article body */}
            <div className="min-w-0">
              <MarkdownRenderer content={post.content} />
            </div>

            {/* Author box */}
            <div className="mt-16 rounded-xl border border-border bg-muted/30 p-6 flex items-start gap-4">
              <div className="flex-shrink-0 h-12 w-12 rounded-full bg-gradient-to-br from-primary to-blue-800 flex items-center justify-center text-white font-bold text-lg">
                {post.author[0]}
              </div>
              <div>
                <div className="font-semibold text-foreground">
                  {post.author}
                </div>
                {post.authorBio ? (
                  <div className="text-sm text-muted-foreground mt-1">
                    {post.authorBio}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground mt-1">
                    Writing about AI voice, business automation, and the future
                    of customer communication at QuickVoice.
                  </div>
                )}
              </div>
            </div>

            {/* Bottom CTA */}
            <div className="mt-12 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-blue-600/5 p-8 text-center">
              <h2 className="text-xl font-bold text-foreground mb-2">
                Ready to inspect the implementation?
              </h2>
              <p className="text-muted-foreground text-sm mb-5">
                Review the code-backed product surface, setup prerequisites,
                provider credentials, and deployment boundaries.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/open-source"
                  className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:shadow-lg"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, var(--primary), #1e40af)",
                  }}
                >
                  Explore the open-source stack
                </Link>
                <Link
                  href="/company/contact"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-all"
                >
                  Book a Demo
                </Link>
              </div>
            </div>
          </article>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-28 space-y-8">
            {/* Related posts */}
            {relatedPosts.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wide">
                  Related Articles
                </h3>
                <div className="space-y-4">
                  {relatedPosts.map((rel) => {
                    const relMeta =
                      CATEGORY_META[rel.category] || defaultMeta();
                    return (
                      <Link
                        key={rel.slug}
                        href={`/blog/${rel.slug}`}
                        className="group block"
                      >
                        <div className="flex gap-3 items-start">
                          <div
                            className={`flex-shrink-0 rounded-lg p-1.5 ${relMeta.bg} ${relMeta.color} mt-0.5`}
                          >
                            {relMeta.icon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                              {rel.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {rel.readTime}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick CTA card */}
            <div className="rounded-xl border border-primary/20 bg-gradient-to-b from-primary/10 to-transparent p-5">
              <h3 className="font-semibold text-foreground mb-2 text-sm">
                Inspect QuickVoice
              </h3>
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                Review what runs locally and which credentials and deployment
                decisions are still required for real calls.
              </p>
              <Link
                href="/open-source"
                className="block text-center rounded-full py-2 text-sm font-medium text-white transition-all hover:shadow-md"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, var(--primary), #1e40af)",
                }}
              >
                Explore the open-source stack
              </Link>
            </div>

            {/* Browse categories */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground mb-3 text-sm uppercase tracking-wide">
                Browse Categories
              </h3>
              <div className="space-y-1">
                {Object.entries(CATEGORY_META).map(([cat, m]) => (
                  <Link
                    key={cat}
                    href={`/blog#${cat.toLowerCase().replace(/\s+/g, "-").replace(/[&]/g, "")}`}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-muted transition-colors ${
                      cat === post.category
                        ? `${m.bg} ${m.color} font-medium`
                        : "text-muted-foreground"
                    }`}
                  >
                    {m.icon}
                    {cat}
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
