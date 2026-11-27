const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

/** Retain owned campaign tokens, never arbitrary query fields or fragments. */
function pageLocation(url) {
  const location = new URL(url);
  if (!["http:", "https:"].includes(location.protocol) || location.username || location.password) return null;
  const query = new URLSearchParams();
  for (const key of CAMPAIGN_KEYS) {
    const values = location.searchParams.getAll(key);
    if (values.length !== 1) continue;
    const value = values[0];
    if (/^[a-zA-Z0-9_-]{1,100}$/.test(value) && !/^[0-9_-]{7,}$/.test(value)) query.set(key, value);
  }
  location.search = query.toString();
  location.hash = "";
  return location.href;
}

function referralOrigin(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : "";
  } catch { return ""; }
}

/**
 * Queue only consented public snapshots, already sanitized before storage.
 * Any privacy boundary discards pending visits; later consent cannot replay them.
 * Consecutive sanitized URLs deduplicate, while back/forward visits still count.
 *
 * @param {string} measurementId
 * @param {(parameters: Record<string, string>) => boolean} send
 * @param {{isActive?: () => boolean, isAllowed?: (url: string) => boolean}} policy
 */
export function createPageviewCoordinator(measurementId, send, policy = {}) {
  let previousLocation = "";
  let initialReferrerAllowed = true;
  const pending = [];

  function reset() {
    pending.length = 0;
    previousLocation = "";
    initialReferrerAllowed = false;
  }

  function permitted(url) {
    try {
      return policy.isActive?.() === true && (url === undefined || policy.isAllowed?.(url) === true);
    } catch { return false; }
  }

  function flush() {
    if (!permitted()) { reset(); return; }
    while (pending.length) {
      if (!permitted(pending[0].page_location)) { reset(); return; }
      try {
        if (!send(pending[0])) return;
      } catch { return; }
      pending.shift();
    }
  }

  /** @param {{ url: string, title: string, referrer?: string }} page */
  function record({ url, title, referrer = "" }) {
    let location;
    try { location = pageLocation(url); } catch { location = null; }
    if (!location || !permitted(url)) { reset(); return false; }
    if (location === previousLocation) {
      flush();
      return false;
    }
    pending.push({
      send_to: measurementId,
      page_location: location,
      page_title: title,
      page_referrer: referralOrigin(previousLocation || (initialReferrerAllowed ? referrer : "")),
    });
    previousLocation = location;
    initialReferrerAllowed = false;
    flush();
    return true;
  }

  return { record, flush, reset };
}
