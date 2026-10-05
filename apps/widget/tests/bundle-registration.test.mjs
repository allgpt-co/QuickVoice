import assert from "node:assert/strict";
import { test } from "node:test";

test("production bundle registers the quickvoice-widget element", async () => {
  const registrations = new Map();
  globalThis.document = { currentScript: null };
  globalThis.window = globalThis;
  globalThis.HTMLElement = class {
    attachShadow() {
      return {};
    }
  };
  globalThis.customElements = {
    get(name) {
      return registrations.get(name);
    },
    define(name, constructor) {
      registrations.set(name, constructor);
    },
  };

  await import("../dist/quickvoice-widget.js");

  assert.equal(typeof registrations.get("quickvoice-widget"), "function");
});

test("style nonces survive every render and an explicit widget nonce overrides the loader", async () => {
  for (const loaderNonce of ["loader-nonce", ""]) {
    let Widget;
    globalThis.document = { currentScript: { nonce: loaderNonce, getAttribute: () => "" } };
    globalThis.window = globalThis;
    globalThis.HTMLElement = class {
      nonce = "";
      attachShadow() {
        this.shadowRoot = { innerHTML: "", querySelector: () => null };
        return this.shadowRoot;
      }
      getAttribute() { return null; }
      hasAttribute() { return false; }
    };
    globalThis.customElements = {
      get: () => undefined,
      define: (_name, constructor) => { Widget = constructor; },
    };
    await import(`../dist/quickvoice-widget.js?nonce=${loaderNonce || "none"}`);
    const widget = new Widget();
    for (const state of ["loading", "idle", "connecting", "live", "ended", "error"]) {
      widget.state = state;
      widget.expanded = !widget.expanded;
      widget.render();
      assert.ok(widget.shadowRoot.innerHTML.includes(loaderNonce ? '<style nonce="loader-nonce">' : "<style>"));
    }
    widget.nonce = 'style-nonce"<&';
    widget.render();
    assert.ok(widget.shadowRoot.innerHTML.includes('<style nonce="style-nonce&quot;&lt;&amp;">'));
    assert.ok(!widget.shadowRoot.innerHTML.includes('<style nonce="loader-nonce">'));
  }
});
