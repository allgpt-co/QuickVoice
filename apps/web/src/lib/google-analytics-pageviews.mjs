/**
 * One coordinator per mounted app layout. Completed visits are queued until the
 * tag is ready; only consecutive identical URLs are duplicates, so back/forward
 * visits still count. Snapshots retain their own title and previous-page referrer.
 *
 * @param {string} measurementId
 * @param {(parameters: Record<string, string>) => boolean} send
 */
export function createPageviewCoordinator(measurementId, send) {
  let previousLocation = "";
  const pending = [];

  function flush() {
    while (pending.length) {
      try {
        if (!send(pending[0])) return;
      } catch {
        return;
      }
      pending.shift();
    }
  }

  /** @param {{ url: string, title: string, referrer?: string }} page */
  function record({ url, title, referrer = "" }) {
    const location = new URL(url);
    if (!["http:", "https:"].includes(location.protocol)) return false;
    location.hash = "";
    if (location.href === previousLocation) {
      flush();
      return false;
    }
    pending.push({
      send_to: measurementId,
      page_location: location.href,
      page_title: title,
      page_referrer: previousLocation || referrer.split("#")[0],
    });
    previousLocation = location.href;
    flush();
    return true;
  }

  return { record, flush };
}
