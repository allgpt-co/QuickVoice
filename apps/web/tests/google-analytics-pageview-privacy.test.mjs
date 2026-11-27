import assert from "node:assert/strict";
import test from "node:test";
import { createPageviewCoordinator } from "../src/lib/google-analytics-pageviews.mjs";

function setup() {
  const state = { active: true, ready: false, events: [] };
  const isAllowed = (url) => {
    const location = new URL(url);
    return location.origin === "https://quickvoice.co" && ["/", "/pricing", "/blog/published"].includes(location.pathname);
  };
  const tracker = createPageviewCoordinator("G-TEST123", event => {
    if (!state.ready) return false;
    state.events.push(event);
    return true;
  }, { isActive: () => state.active, isAllowed });
  return { state, tracker };
}

test("blocked snapshots discard queued visits and cannot replay after returning to public", () => {
  const {state, tracker} = setup();
  tracker.record({url:"https://quickvoice.co/", title:"Old public"});
  for (const path of ["/dashboard/customer", "/blog/unknown", "/unknown"]) {
    assert.equal(tracker.record({url:`https://quickvoice.co${path}`, title:"Private marker"}), false);
  }
  state.ready = true;
  tracker.flush();
  assert.deepEqual(state.events, []);
  tracker.record({url:"https://quickvoice.co/pricing", title:"Pricing", referrer:"https://example.com/private?email=qa"});
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].page_referrer, "");
  assert.equal(JSON.stringify(state.events).includes("Private marker"), false);
});

test("revocation while waiting and denied visits are never replayed on re-consent", () => {
  const {state, tracker} = setup();
  tracker.record({url:"https://quickvoice.co/", title:"Before revoke"});
  state.active = false;
  tracker.flush();
  assert.equal(tracker.record({url:"https://quickvoice.co/pricing", title:"While denied"}), false);
  state.active = state.ready = true;
  tracker.flush();
  assert.deepEqual(state.events, []);
  tracker.record({url:"https://quickvoice.co/", title:"After grant"});
  assert.deepEqual(state.events.map(event=>event.page_title), ["After grant"]);
});

test("queued and sent URLs retain campaign tokens but discard arbitrary queries and fragments", () => {
  const {state, tracker} = setup();
  tracker.record({url:"https://quickvoice.co/pricing?email=qa%40example.invalid&token=secret&UTM_SOURCE=bad&utm_source=google&utm_medium=organic&utm_campaign=fall_2026&utm_content=footer&utm_term=voice-ai&message=private#secret", title:"Pricing", referrer:"https://user:pass@search.example/customer?q=secret#private"});
  state.ready = true;
  tracker.flush();
  assert.equal(state.events[0].page_location, "https://quickvoice.co/pricing?utm_source=google&utm_medium=organic&utm_campaign=fall_2026&utm_content=footer&utm_term=voice-ai");
  assert.equal(state.events[0].page_referrer, "https://search.example");
  tracker.record({url:"https://quickvoice.co/pricing?utm_source=qa%40example.invalid&utm_medium=two+words&utm_campaign=1234567890&utm_content=one&utm_content=two", title:"Pricing"});
  assert.equal(state.events[1].page_location, "https://quickvoice.co/pricing");
  assert.equal(state.events[1].page_referrer, "https://quickvoice.co");
});

test("malformed, credentialed, non-http and foreign snapshots fail closed without crashing navigation", () => {
  const {state, tracker} = setup();
  state.ready = true;
  for (const url of ["bad url", "javascript:alert(1)", "https://user:pass@quickvoice.co/pricing", "https://evil.example/pricing"]) {
    assert.doesNotThrow(()=>assert.equal(tracker.record({url,title:"Bad"}), false));
  }
  assert.deepEqual(state.events, []);
});

test("missing or broken privacy policies fail closed", () => {
  for (const policy of [undefined, {}, {isActive:()=>true,isAllowed:()=>{throw new Error("unavailable");}}]) {
    const events=[];
    const tracker=createPageviewCoordinator("G-TEST123", event=>{events.push(event);return true;}, policy);
    assert.doesNotThrow(()=>assert.equal(tracker.record({url:"https://quickvoice.co/",title:"Home"}), false));
    tracker.flush();
    assert.deepEqual(events, []);
  }
});

test("unmount reset drops pending history while sanitized identities preserve back and forward visits", () => {
  const {state, tracker} = setup();
  tracker.record({url:"https://quickvoice.co/",title:"Pending"});
  tracker.reset();
  state.ready = true;
  tracker.flush();
  assert.deepEqual(state.events, []);
  for (const url of ["https://quickvoice.co/", "https://quickvoice.co/?email=one#fragment", "https://quickvoice.co/pricing", "https://quickvoice.co/", "https://quickvoice.co/pricing"]) tracker.record({url,title:"Public"});
  assert.deepEqual(state.events.map(event=>event.page_location), ["https://quickvoice.co/","https://quickvoice.co/pricing","https://quickvoice.co/","https://quickvoice.co/pricing"]);
});
