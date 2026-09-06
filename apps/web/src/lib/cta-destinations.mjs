/**
 * Query strings and fragments are not needed to classify a CTA or report its
 * destination. Excluding them also keeps visitor-supplied values out of events.
 * @param {string} rawHref
 * @param {string} origin
 */
export function analyticsDestination(rawHref, origin) {
  try {
    const url = new URL(rawHref, origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "") || "/"}`;
  } catch {
    return null;
  }
}

/** @param {string} rawHref @param {string} expectedHref @param {string} origin */
export function matchesAnalyticsDestination(rawHref, expectedHref, origin) {
  const target = analyticsDestination(rawHref, origin);
  return (
    target !== null && target === analyticsDestination(expectedHref, origin)
  );
}
