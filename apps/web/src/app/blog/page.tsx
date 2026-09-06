import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { getAllPosts, isIndexablePost, type BlogPost } from "@/lib/blog";
import { BLOG_TOPICS, blogListingHref, blogListingMetadata, getBlogListing } from "@/lib/blog-discovery.mjs";
import { BlogCard } from "@/components/blog/BlogCard";
import { CONTACT_URL, DEMO_BOOKING_URL } from "@/lib/links";

export const revalidate = 3600;
type SearchParams = Record<string, string | string[] | undefined>;
interface Props { searchParams: Promise<SearchParams> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const policy = blogListingMetadata(await searchParams);
  return {
    title: "AI phone-agent guides for business",
    description: "Explore practical guides to phone workflows, platform comparisons, implementation, and the costs of a focused voice-agent pilot.",
    alternates: { canonical: policy.canonical },
    robots: { index: policy.index, follow: true },
    openGraph: {
      title: "AI phone-agent guides for business | QuickVoice",
      description: "Find the next useful step for your business phone workflow.",
      url: policy.canonical, type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title: "QuickVoice buyer guides", images: ["/og-image.png"] },
  };
}

export default async function BlogIndexPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const publishedPosts = getAllPosts({ now });
  const reviewedPosts = publishedPosts.filter((post) => isIndexablePost(post, { now }));
  const listing = getBlogListing(reviewedPosts, params);
  if (listing.outOfRange) notFound();
  const { query, topic, requestedPage, filteredPosts } = listing;
  const archive = publishedPosts.filter((post) => !isIndexablePost(post, { now }))
    .filter((post) => !query || post.title.toLowerCase().includes(query.toLowerCase()));
  const topicLabel = BLOG_TOPICS.find((item) => item.id === topic)?.label;
  const pageHref = (page: number) => blogListingHref({ query, topic, page });
  const schema = {
    "@context": "https://schema.org", "@type": "CollectionPage", name: "QuickVoice buyer guides",
    description: "Reviewed guides to business phone workflows and voice-agent evaluation.",
    url: blogListingMetadata(params).canonical,
  };

  return (
    <div className="bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <section className="page-section border-b border-border">
        <div className="site-container">
          <p className="eyebrow">Guides and practical reading</p>
          <h1 className="page-title mt-4 max-w-3xl">Make a clearer decision about AI phone agents.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Practical guides to business call workflows, costs, and implementation.</p>
          <Link href="/resources" className="mt-6 inline-flex items-center gap-2 font-semibold text-primary">Get the checklist and cost worksheet <ArrowRight aria-hidden="true" className="size-4" /></Link>
        </div>
      </section>

      <section className="page-section" aria-labelledby="guides-heading">
        <div className="site-container">
          <form key={JSON.stringify([query, topic])} action="/blog" method="get" className="surface-card grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_17rem_auto] lg:items-end" role="search">
            <div>
              <label htmlFor="blog-search" className="mb-2 block text-sm font-semibold">Search guides</label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <input id="blog-search" name="q" type="search" maxLength={120} defaultValue={query} placeholder="Try appointment scheduling or costs" className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-base" />
              </div>
            </div>
            <div>
              <label htmlFor="blog-topic" className="mb-2 block text-sm font-semibold">Topic</label>
              <select id="blog-topic" name="topic" defaultValue={topic} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base">
                <option value="">All topics</option>
                {BLOG_TOPICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </div>
            <button type="submit" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 font-semibold text-primary-foreground">Find guides</button>
          </form>

          <nav aria-label="Guide topics" className="mt-5 flex flex-wrap gap-2">
            <Link href={blogListingHref({ query })} aria-current={!topic && !listing.invalidTopic ? "page" : undefined} className={"rounded-full border px-4 py-2 text-sm font-medium " + (!topic && !listing.invalidTopic ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}>All topics</Link>
            {BLOG_TOPICS.map((item) => <Link key={item.id} href={blogListingHref({ query, topic: item.id })} aria-current={topic === item.id ? "page" : undefined} className={"rounded-full border px-4 py-2 text-sm font-medium " + (topic === item.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}>{item.label}</Link>)}
          </nav>

          <div id="guides-heading" className="mb-6 mt-10 flex scroll-mt-28 flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{topicLabel || "All reviewed guides"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {listing.total ? "Showing " + listing.firstResult + "–" + listing.lastResult + " of " + filteredPosts.length + " guides" : "No matching guides"}
                {query && <> for &ldquo;{query}&rdquo;</>}
              </p>
            </div>
            {(query || topic || listing.invalidTopic) && <Link href="/blog" className="text-sm font-semibold text-primary underline underline-offset-4">Clear filters</Link>}
          </div>

          {listing.posts.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{listing.posts.map((post: BlogPost) => <BlogCard key={post.slug} post={post} />)}</div> : (
            <div className="surface-card px-6 py-12">
              <h3 className="text-xl font-semibold">No reviewed guides found</h3>
              <p className="mt-3 max-w-xl leading-7 text-muted-foreground">{listing.invalidTopic ? "That topic is not available. Choose a topic above or browse all guides." : "Try a broader phrase, choose another topic, or clear the filters to browse all guides."}</p>
              <Link href="/blog" className="mt-5 inline-block font-semibold text-primary underline underline-offset-4">Browse all guides</Link>
            </div>
          )}

          {listing.pageCount > 1 && (
            <nav aria-label="Guide pagination" className="mt-10 flex flex-wrap items-center justify-center gap-2 border-t border-border pt-8">
              {requestedPage > 1 && <Link href={pageHref(requestedPage - 1)} rel="prev" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium"><ArrowLeft aria-hidden="true" className="size-4" /> Previous</Link>}
              {Array.from({ length: listing.pageCount }, (_, index) => index + 1).map((page) => <Link key={page} href={pageHref(page)} aria-label={"Page " + page} aria-current={requestedPage === page ? "page" : undefined} className={"inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold " + (requestedPage === page ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}>{page}</Link>)}
              {requestedPage < listing.pageCount && <Link href={pageHref(requestedPage + 1)} rel="next" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium">Next <ArrowRight aria-hidden="true" className="size-4" /></Link>}
            </nav>
          )}

          {archive.length > 0 && !topic && !listing.invalidTopic && requestedPage === 1 && (
            <details className="mt-12 rounded-xl border border-border p-6">
              <summary className="cursor-pointer font-semibold">Earlier articles awaiting publication review ({archive.length})</summary>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">These articles remain available for reference. Their current claims have not passed the publication review and should be checked before use.</p>
              <ul className="mt-4 space-y-3">{archive.map((post) => <li key={post.slug}><Link href={"/blog/" + post.slug} className="text-sm text-primary underline underline-offset-4">{post.title}</Link></li>)}</ul>
            </details>
          )}
        </div>
      </section>

      <section className="border-t border-border bg-muted/40 py-12 sm:py-16">
        <div className="site-container flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div><h2 className="text-2xl font-semibold tracking-tight">Bring one workflow to a demo.</h2><p className="mt-3 max-w-xl leading-7 text-muted-foreground">Discuss the calls you handle, your systems, and the next step you want to test.</p></div>
          <div className="flex flex-wrap gap-3">
            <Link href={DEMO_BOOKING_URL} data-analytics-location="blog_hub" className="inline-flex items-center rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground">Book a demo</Link>
            <Link href={CONTACT_URL} data-analytics-location="blog_hub" className="inline-flex items-center rounded-lg border border-border px-5 py-3 font-semibold">Contact the team</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
