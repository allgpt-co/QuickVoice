import assert from "node:assert/strict";
import test from "node:test";
import { computeContentHash } from "../src/lib/blog-review.mjs";
import { findUnreviewedScheduledPosts } from "../src/lib/blog-schedule.mjs";

const now = new Date("2026-10-02T12:00:00.000Z");
const body = "Body\n";
function post(overrides) {
  const { reviewed, ...data } = { slug: "post", title: "Post", date: "2026-09-21", ...overrides };
  const review = reviewed
    ? { status: "reviewed", reviewedAt: "2026-09-20T10:00:00.000Z", reviewer: "Reviewer", sources: ["https://example.com/source"], contentHash: computeContentHash(data, body) }
    : undefined;
  return { ...data, evidenceReview: review, contentHash: computeContentHash(data, body) };
}

test("flags published posts whose date is past or within the review window and that lack a valid review", () => {
  const due = findUnreviewedScheduledPosts(
    [
      post({ slug: "past-due" }),
      post({ slug: "due-soon", date: "2026-10-08" }),
      post({ slug: "far-future", date: "2026-10-20" }),
      post({ slug: "reviewed", reviewed: true }),
      post({ slug: "explicit-draft", draft: true }),
      post({ slug: "status-draft", status: "draft" }),
      post({ slug: "unpublished", published: false }),
      post({ slug: "bad-date", date: "2026-02-30" }),
    ],
    { now, windowDays: 7 },
  );
  assert.deepEqual(due.map((entry) => entry.slug), ["past-due", "due-soon"]);
  assert.equal(due[0].reason, "published without a valid evidence review");
  assert.equal(due[0].pastDue, true);
  assert.equal(due[1].reason, "scheduled within 7 days without a valid evidence review");
  assert.equal(due[1].pastDue, false);
  assert.equal(findUnreviewedScheduledPosts([post({ slug: "with-file", file: "content/blog/x.md" })], { now })[0].file, "content/blog/x.md");
});

test("a stale review counts as unreviewed once the content changed", () => {
  const edited = post({ slug: "edited", reviewed: true });
  edited.contentHash = computeContentHash({ slug: "edited", title: "Edited", date: "2026-09-21" }, body);
  assert.equal(findUnreviewedScheduledPosts([edited], { now }).length, 1);
});
