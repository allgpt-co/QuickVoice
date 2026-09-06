import { createHash } from "node:crypto";

function canonicalValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

/** Hash public content and metadata, excluding the review record itself. */
export function computeContentHash(frontmatter, content) {
  const metadata = { ...frontmatter };
  delete metadata.evidenceReview;
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue({ metadata, content })))
    .digest("hex");
}

/** Accept a real ISO calendar date or UTC timestamp, never normalized bad dates. */
export function parseContentDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  return date;
}

export function isEvidenceSource(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isValidEvidenceReview(review, contentHash, now = new Date()) {
  if (!review || typeof review !== "object" || review.status !== "reviewed") return false;
  const reviewedAt = parseContentDate(review.reviewedAt);
  return Boolean(
    reviewedAt && review.reviewedAt.includes("T") && reviewedAt <= now &&
    typeof review.reviewer === "string" && review.reviewer.trim() &&
    Array.isArray(review.sources) && review.sources.length > 0 && review.sources.every(isEvidenceSource) &&
    /^[a-f0-9]{64}$/.test(review.contentHash) && review.contentHash === contentHash,
  );
}
