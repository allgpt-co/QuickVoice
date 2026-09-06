import assert from "node:assert/strict";
import test from "node:test";
import { createPageviewCoordinator } from "../src/lib/google-analytics-pageviews.mjs";

test("initial, committed path/query, back and forward visits count once; duplicate and hash changes do not", () => {
  const events = [];
  const tracker = createPageviewCoordinator("G-TEST123", (event) => { events.push(event); return true; });
  const home = { url: "https://quickvoice.co/", title: "Home", referrer: "https://example.com/search#result" };
  const blog = { url: "https://quickvoice.co/blog", title: "Blog" };
  const filtered = { url: "https://quickvoice.co/blog?category=scheduling", title: "Blog" };

  assert.equal(tracker.record(home), true);
  assert.equal(tracker.record(home), false); // Strict Mode effect replay.
  assert.equal(tracker.record({ ...home, url: home.url + "#main-content" }), false);
  tracker.record(blog);
  tracker.record(filtered);
  tracker.record(blog); // Back.
  tracker.record(filtered); // Forward.
  tracker.record(filtered); // Unchanged replace/refresh.
  tracker.flush();

  assert.deepEqual(events.map((event) => event.page_location), [home.url, blog.url, filtered.url, blog.url, filtered.url]);
  assert.deepEqual(events.map((event) => event.page_referrer), ["https://example.com/search", home.url, blog.url, filtered.url, blog.url]);
  assert.deepEqual(events.map((event) => event.page_title), ["Home", "Blog", "Blog", "Blog", "Blog"]);
  assert.ok(events.every((event) => event.send_to === "G-TEST123"));
});

test("late tag readiness preserves each completed visit's title and referrer without duplicate flushing", () => {
  let ready = false;
  const events = [];
  const tracker = createPageviewCoordinator("G-TEST123", (event) => {
    if (!ready) return false;
    events.push(event);
    return true;
  });
  tracker.record({ url: "https://quickvoice.co/", title: "Initial title" });
  tracker.record({ url: "https://quickvoice.co/blog?sort=new", title: "Updated title" });
  assert.equal(events.length, 0);
  ready = true;
  tracker.flush();
  tracker.flush();
  tracker.record({ url: "https://quickvoice.co/blog?sort=new#archive", title: "Updated title" });
  assert.equal(events.length, 2);
  assert.equal(events[0].page_title, "Initial title");
  assert.equal(events[1].page_title, "Updated title");
  assert.equal(events[1].page_referrer, "https://quickvoice.co/");
});

test("an unavailable sender does not crash navigation or discard an unsent view", () => {
  let unavailable = true;
  const events = [];
  const tracker = createPageviewCoordinator("G-TEST123", (event) => {
    if (unavailable) throw new Error("Tag not ready");
    events.push(event);
    return true;
  });
  assert.doesNotThrow(() => tracker.record({ url: "https://quickvoice.co/blog", title: "Blog" }));
  unavailable = false;
  tracker.flush();
  tracker.flush();
  assert.equal(events.length, 1);
});
