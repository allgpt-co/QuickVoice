import { isValidEvidenceReview, parseContentDate } from "./blog-review.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Find scheduled or published posts that will render (or already render) as
 * noindex because they have no valid evidence review.
 *
 * A post that passes its publication date without a review is live for readers
 * but invisible to search engines, and Search Console records a stale noindex
 * verdict that can take weeks to clear once the review lands. Catching the gap
 * `windowDays` before the date keeps the release calendar honest.
 *
 * @param {Array<{slug: string, date?: string, file?: string, draft?: boolean, published?: boolean, status?: string, evidenceReview?: object, contentHash: string}>} posts
 * @param {{ now?: Date, windowDays?: number }} options
 * @returns {Array<{slug: string, date: string, file?: string, pastDue: boolean, reason: string}>}
 *   `pastDue` entries are live-but-noindex today; the rest are upcoming within the window.
 */
export function findUnreviewedScheduledPosts(posts, { now = new Date(), windowDays = 7 } = {}) {
  const horizon = new Date(now.getTime() + windowDays * DAY_MS);
  const due = [];
  for (const post of posts) {
    if (post.draft === true || post.published === false || post.status === "draft") continue;
    const publishedAt = parseContentDate(post.date);
    if (!publishedAt || publishedAt > horizon) continue;
    if (isValidEvidenceReview(post.evidenceReview, post.contentHash, now)) continue;
    due.push({
      slug: post.slug,
      date: post.date,
      file: post.file,
      pastDue: publishedAt <= now,
      reason:
        publishedAt <= now
          ? "published without a valid evidence review"
          : `scheduled within ${windowDays} days without a valid evidence review`,
    });
  }
  return due;
}
