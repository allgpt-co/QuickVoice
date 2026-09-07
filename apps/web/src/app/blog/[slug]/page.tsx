import { getPostBySlug, getAllSlugs, getRelatedPosts, isIndexablePost, getPostModifiedDate } from "@/lib/blog";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import { ArticleContents } from "@/components/blog/ArticleContents";
import { BlogCard, formatArticleDate } from "@/components/blog/BlogCard";
import { getEditorialHeadings } from "@/lib/editorial-headings.mjs";
import { getBlogTopic, blogListingHref } from "@/lib/blog-discovery.mjs";
import { EvidenceStatusNotice } from "@/components/evidence-status-notice";
import { CONTACT_URL, DEMO_BOOKING_URL } from "@/lib/links";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";

interface Props { params: Promise<{ slug: string }> }
export const revalidate = 3600;
export const dynamic = "force-static";

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: { absolute: post.metaTitle || post.title },
    description: post.metaDescription,
    alternates: { canonical: post.canonical },
    robots: { index: isIndexablePost(post), follow: true },
    openGraph: {
      title: post.metaTitle || post.title,
      description: post.metaDescription,
      type: "article",
      publishedTime: post.date,
      modifiedTime: getPostModifiedDate(post),
      authors: [post.author],
      tags: post.tags,
      url: "https://quickvoice.co/blog/" + slug,
      siteName: "QuickVoice",
      images: [{ url: post.ogImage || "/og-image.png", width: 1200, height: 630, alt: post.metaTitle || post.title }],
    },
    twitter: { card: "summary_large_image", title: post.metaTitle || post.title, description: post.metaDescription, images: [post.ogImage || "/og-image.png"] },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();
  const relatedPosts = getRelatedPosts(slug, 3);
  const topic = getBlogTopic(post);
  const indexable = isIndexablePost(post);
  const modifiedDate = getPostModifiedDate(post);
  const headings = getEditorialHeadings(post.content, { title: post.title });
  const articleSchema = {
    "@context": "https://schema.org", "@type": "BlogPosting",
    headline: post.metaTitle || post.title,
    description: post.metaDescription,
    author: { "@type": "Person", name: post.author },
    publisher: { "@type": "Organization", name: "QuickVoice", url: "https://quickvoice.co", logo: { "@type": "ImageObject", url: "https://quickvoice.co/logo.svg" } },
    datePublished: post.date, dateModified: modifiedDate,
    mainEntityOfPage: { "@type": "WebPage", "@id": "https://quickvoice.co/blog/" + post.slug },
    image: new URL(post.ogImage || "/og-image.png", "https://quickvoice.co").href,
    url: "https://quickvoice.co/blog/" + post.slug, keywords: post.tags.join(", "),
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://quickvoice.co" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://quickvoice.co/blog" },
      { "@type": "ListItem", position: 3, name: post.title, item: "https://quickvoice.co/blog/" + post.slug },
    ],
  };

  return (
    <div className="bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(indexable ? [articleSchema, breadcrumbSchema] : [breadcrumbSchema]).replace(/</g, "\\u003c") }} />
      <header className="page-section border-b border-border">
        <div className="site-container">
          <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-2">
              <li><Link href="/" className="hover:text-primary">Home</Link></li>
              <li aria-hidden="true"><ChevronRight className="size-3.5" /></li>
              <li><Link href="/blog" className="hover:text-primary">Guides</Link></li>
              <li aria-hidden="true"><ChevronRight className="size-3.5" /></li>
              <li><Link href={blogListingHref({ topic: topic.id })} className="hover:text-primary">{topic.label}</Link></li>
            </ol>
          </nav>
          <p className="eyebrow">{topic.label}</p>
          <h1 className="page-title mt-4 max-w-4xl">{post.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{post.metaDescription}</p>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span>By {post.author}</span>
            <span>Published <time dateTime={post.date}>{formatArticleDate(post.date)}</time></span>
            {modifiedDate !== post.date && <span>Updated <time dateTime={modifiedDate}>{formatArticleDate(modifiedDate)}</time></span>}
            <span>{post.readTime} read</span>
          </div>
        </div>
      </header>

      <div className="site-container py-10 sm:py-14">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] xl:gap-16">
          <article className="min-w-0 max-w-[72ch]">
            {!indexable && <div className="mb-8"><EvidenceStatusNotice title="Editorial content under evidence review"><p>This article has not passed the current publication review. Verify its sources and current product behavior before relying on it for a buying or implementation decision.</p></EvidenceStatusNotice></div>}
            {headings.length > 1 && <details className="mb-8 rounded-xl border border-border p-5 lg:hidden"><summary className="cursor-pointer font-semibold">On this page</summary><div className="mt-4"><ArticleContents headings={headings} /></div></details>}
            <MarkdownRenderer content={post.content} title={post.title} />
            <div className="mt-12 border-t border-border pt-6">
              <p className="text-sm font-semibold">{post.author}</p>
              {post.authorBio && <p className="mt-2 text-sm leading-7 text-muted-foreground">{post.authorBio}</p>}
              <Link href={blogListingHref({ topic: topic.id })} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">More {topic.label.toLowerCase()} guides <ArrowRight aria-hidden="true" className="size-4" /></Link>
            </div>
          </article>
          <aside className="space-y-6 lg:sticky lg:top-28">
            {headings.length > 1 && <div className="hidden max-h-[calc(100dvh-10rem)] overflow-y-auto border-l border-border pl-5 lg:block"><p className="mb-4 text-sm font-semibold">On this page</p><ArticleContents headings={headings} /></div>}
            <div className="surface-card p-5">
              <h2 className="text-base font-semibold">Turn reading into a plan.</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">Define one workflow and its full operating cost with the buyer checklist and editable worksheet.</p>
              <Link href="/resources" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Get the resources <ArrowRight aria-hidden="true" className="size-4" /></Link>
            </div>
          </aside>
        </div>
      </div>

      {relatedPosts.length > 0 && <section className="page-section border-t border-border bg-muted/30"><div className="site-container"><div className="mb-7 flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-semibold tracking-tight">Keep exploring</h2><Link href="/blog" className="text-sm font-semibold text-primary">Browse all guides</Link></div><div className="grid gap-5 md:grid-cols-3">{relatedPosts.map((related) => <BlogCard key={related.slug} post={related} />)}</div></div></section>}
      <section className="border-t border-border py-12 sm:py-16">
        <div className="site-container flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div><h2 className="text-2xl font-semibold tracking-tight">Discuss your workflow with us.</h2><p className="mt-3 max-w-xl leading-7 text-muted-foreground">Bring your call types, current process, and questions about implementation to a demo.</p></div>
          <div className="flex flex-wrap gap-3">
            <Link href={DEMO_BOOKING_URL} data-analytics-location="article_footer" className="inline-flex items-center rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground">Book a demo</Link>
            <Link href={CONTACT_URL} data-analytics-location="article_footer" className="inline-flex items-center rounded-lg border border-border px-5 py-3 font-semibold">Contact the team</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
