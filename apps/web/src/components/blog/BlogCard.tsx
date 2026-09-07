import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { BlogPost } from "@/lib/blog";
import { getBlogTopic } from "@/lib/blog-discovery.mjs";

export function formatArticleDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });
}

export function BlogCard({ post }: { post: BlogPost }) {
  return (
    <article className="surface-card flex h-full flex-col p-6 sm:p-7">
      <p className="eyebrow">{getBlogTopic(post).label}</p>
      <h3 className="mt-4 text-xl font-semibold leading-snug tracking-tight">
        <Link href={`/blog/${post.slug}`} className="decoration-primary underline-offset-4 hover:underline">
          {post.title}
        </Link>
      </h3>
      <p className="mt-3 flex-1 text-sm leading-7 text-muted-foreground">{post.metaDescription}</p>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
        <span><time dateTime={post.date}>{formatArticleDate(post.date)}</time><span aria-hidden="true"> · </span>{post.readTime} read</span>
        <Link href={`/blog/${post.slug}`} aria-label={`Read ${post.title}`} className="inline-flex items-center gap-1 font-semibold text-primary">
          Read guide <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </article>
  );
}
