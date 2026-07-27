# Website Widget Feature — E2E Testing Guide

## Code analysis summary

This guide is based on the pulled Website Widget implementation.

### Entry points

| Area | Implementation |
|---|---|
| Agent tab | `apps/console/src/components/agents/AgentTabs.tsx` adds `Website widget` tab (`tab=widget`). |
| Admin UI | `apps/console/src/components/agents/tabs/WebsiteWidgetTab.tsx`. |
| Console API | `apps/console/src/lib/api/resources/widgets.ts`, `apps/console/src/hooks/queries/widgets.ts`. |
| Server routes | `apps/server/src/modules/widgets/widget.route.ts`. |
| Server logic | `widget.controller.ts`, `widget.service.ts`, `widget.repository.ts`. |
| Public script | `apps/widget/src/index.ts`, served as `/widget/v1/quickvoice-widget.js`. |
| DB | `AgentWidget`, `AgentWidgetSession`, `AgentWidgetSessionStatus`. |
| Runtime | Public widget creates LiveKit/AI voice sessions with metadata `mode=widget`, `source=web_widget`. |

### APIs

Admin authenticated APIs:

- `GET /api/v1/agents/:agentId/widgets`
- `POST /api/v1/agents/:agentId/widgets`
- `GET /api/v1/widgets/:widgetId`
- `PATCH /api/v1/widgets/:widgetId`
- `DELETE /api/v1/widgets/:widgetId`

Public unauthenticated APIs with widget-specific CORS:

- `GET /api/v1/public/widgets/:widgetId/config`
- `POST /api/v1/public/widgets/:widgetId/sessions`
- `POST /api/v1/public/widgets/:widgetId/sessions/:sessionId/end`

Static asset:

- `GET /widget/v1/quickvoice-widget.js`

### Admin UI options

- Publishing: widget name, enabled, allowed origins.
- Brand: brand name, avatar URL, show avatar, whitelabel, avatar orb colors.
- Appearance: primary/accent/surface/text/muted/button/border colors, panel width, radius, launcher size, position, open by default.
- Display text: launcher, welcome, start, end, connecting, listening, speaking, ended.
- Terms: consent required, consent text.
- Embed snippet copy.

### Public widget states

`loading`, `idle`, `requesting`, `connecting`, `live`, `ended`, `error`.

### Important constraints

- Enabled widget requires configured agent + at least one allowed origin.
- Public widget only works if widget is enabled, agent is active, and agent is configured.
- Allowed origins are exact origins. Paths, queries, hashes, credentials, and wildcards are rejected.
- Non-localhost `http://` origins are rejected. Localhost HTTP works only with `WIDGET_ALLOW_LOCALHOST_ORIGINS=true`.
- Public widget fetches use `credentials: "omit"`.
- Visitor id is stored in `localStorage` as `quickvoice_widget_visitor_id`.
- Session TTL default is 900s, max capped at 3600s.
- Rate limit defaults to 10 sessions per 60s per widget+origin+IP.
- Concurrent session limit defaults to 5 active sessions per widget.

---

## Local setup for testing

1. Apply latest DB migration.
2. Run Redis.
3. Run server on `http://localhost:5000`.
4. Run console on `http://localhost:3000`.
5. Run AI service and LiveKit.
6. Build widget asset:

```bash
pnpm --filter quickvoice-widget build
```

Required local server env:

```env
SERVER_URL=http://localhost:5000
WIDGET_ASSET_DIR=../widget/dist
WIDGET_ALLOW_LOCALHOST_ORIGINS=true
WIDGET_SESSION_TTL_SECONDS=900
WIDGET_RATE_LIMIT_WINDOW_SECONDS=60
WIDGET_RATE_LIMIT_MAX_SESSIONS=10
WIDGET_MAX_CONCURRENT_SESSIONS_PER_WIDGET=5
```

Verify static script:

```bash
curl -I http://localhost:5000/widget/v1/quickvoice-widget.js
```

Expected: `200`, `Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`.

Local host test page example, served from an allowed origin like `http://localhost:3005`:

```html
<!doctype html>
<html>
  <body>
    <h1>QuickVoice widget test</h1>
    <quickvoice-widget
      widget-id="WIDGET_ID"
      api-base-url="http://localhost:5000/api/v1"
    ></quickvoice-widget>
    <script async src="http://localhost:5000/widget/v1/quickvoice-widget.js"></script>
  </body>
</html>
```

---

## Test summary

| Category | Count |
|---|---:|
| Functional | 24 |
| Admin UI / Visual | 12 |
| Public Widget UI / Visual | 14 |
| API / Backend | 18 |
| Accessibility | 10 |
| Error / Resilience | 12 |
| Security | 12 |
| Integration | 9 |
| Performance | 7 |
| Regression checklist | 15 |

---

## Functional test cases

### FUNC-001 — Website widget tab is visible
- **Preconditions:** User logged in; agent exists.
- **Steps:** Open `/agents/:agentId`; inspect tabs.
- **Expected:** `Website widget` tab appears and is selectable.
- **Priority:** Critical

### FUNC-002 — Direct tab URL works
- **Preconditions:** Same as above.
- **Steps:** Open `/agents/:agentId?tab=widget`.
- **Expected:** Website widget tab is active; list/editor loads.
- **Priority:** High

### FUNC-003 — Empty widget state
- **Preconditions:** Agent has no widgets.
- **Steps:** Open Website widget tab.
- **Expected:** Left panel says no widgets exist; editor shows Create widget form.
- **Priority:** High

### FUNC-004 — Create disabled widget
- **Preconditions:** Agent exists.
- **Steps:** Keep defaults; Enabled off; click Create widget.
- **Expected:** Widget created; toast shown; widget appears in list; embed snippet generated.
- **Priority:** Critical

### FUNC-005 — Enabled widget requires allowed origin
- **Preconditions:** Configured agent.
- **Steps:** Turn Enabled on; leave origins empty; create/save.
- **Expected:** API rejects with “Add at least one allowed origin before enabling”.
- **Priority:** Critical

### FUNC-006 — Enabled widget requires configured agent
- **Preconditions:** Agent is not configured.
- **Steps:** Add valid origin; enable; create/save.
- **Expected:** API rejects with “Configure this agent before enabling a widget”.
- **Priority:** Critical

### FUNC-007 — Valid HTTPS origin saves
- **Steps:** Add `https://example.com`; enable; create/save.
- **Expected:** Widget saves with origin exactly `https://example.com`.
- **Priority:** Critical

### FUNC-008 — Localhost origin saves in dev
- **Preconditions:** `WIDGET_ALLOW_LOCALHOST_ORIGINS=true`.
- **Steps:** Add `http://localhost:3005`; enable; save.
- **Expected:** Widget saves and public requests from that origin work.
- **Priority:** High

### FUNC-009 — Invalid origins rejected
- **Steps:** Try `https://example.com/path`, `https://example.com?x=1`, `https://*.example.com`, `ftp://example.com`, `http://example.com`, `https://u:p@example.com`.
- **Expected:** Save fails with invalid origin error.
- **Priority:** Critical

### FUNC-010 — Duplicate origins normalized
- **Steps:** Add same origin multiple times separated by lines/commas; save.
- **Expected:** Saved allowed origins contain one unique value.
- **Priority:** Medium

### FUNC-011 — Select widget from list
- **Preconditions:** Agent has 2+ widgets.
- **Steps:** Click each widget in left panel.
- **Expected:** Editor updates to selected widget values; badge shows Enabled/Disabled.
- **Priority:** High

### FUNC-012 — Update widget settings
- **Steps:** Change name, origins, theme, text, consent; save.
- **Expected:** Toast says Widget saved; reload keeps values.
- **Priority:** Critical

### FUNC-013 — Toggle enabled off
- **Preconditions:** Enabled widget.
- **Steps:** Disable and save.
- **Expected:** Widget list badge says Disabled; public config/session no longer works.
- **Priority:** Critical

### FUNC-014 — Toggle enabled on
- **Preconditions:** Disabled widget with valid origin and configured active agent.
- **Steps:** Enable and save.
- **Expected:** Public config/session works from allowed origin.
- **Priority:** Critical

### FUNC-015 — Live editor preview updates
- **Steps:** Change colors, panel width, radius, launcher size, position, brand/welcome text.
- **Expected:** Widget preview updates immediately before saving.
- **Priority:** High

### FUNC-016 — Consent settings preview
- **Steps:** Toggle Consent required; edit consent text.
- **Expected:** Consent block appears/disappears and text updates.
- **Priority:** High

### FUNC-017 — Whitelabel behavior
- **Steps:** Toggle Whitelabel.
- **Expected:** “Powered by QuickVoice” hides/shows in preview and public widget.
- **Priority:** Medium

### FUNC-018 — Copy embed snippet
- **Preconditions:** Existing widget.
- **Steps:** Click Copy.
- **Expected:** Clipboard contains `<quickvoice-widget widget-id="...">` and script URL; toast appears.
- **Priority:** High

### FUNC-019 — Copy disabled before creation
- **Preconditions:** New widget form.
- **Steps:** Inspect Copy button/snippet.
- **Expected:** Copy disabled; code says create widget to generate snippet.
- **Priority:** Medium

### FUNC-020 — Delete widget
- **Steps:** Click Delete; confirm.
- **Expected:** Widget deleted, removed from list, public widget stops loading.
- **Priority:** Critical

### FUNC-021 — Cancel delete
- **Steps:** Click Delete; cancel confirmation.
- **Expected:** Widget remains unchanged.
- **Priority:** High

### FUNC-022 — Public script registers custom element
- **Steps:** Load embed test page.
- **Expected:** `customElements.get("quickvoice-widget")` exists and launcher renders.
- **Priority:** Critical

### FUNC-023 — Public widget starts call
- **Preconditions:** Widget enabled, allowed origin, mic allowed, LiveKit/AI healthy.
- **Steps:** Open panel; accept consent; Start call.
- **Expected:** State goes requesting → connecting → live/listening.
- **Priority:** Critical

### FUNC-024 — Public widget ends call
- **Preconditions:** Widget live.
- **Steps:** Click End call.
- **Expected:** Mic stops, room disconnects, `/sessions/:id/end` called with end token, UI shows ended text.
- **Priority:** Critical

---

## Admin UI / visual tests

### UI-001 — Loading skeleton
- **Steps:** Slow widget list request.
- **Expected:** Left/right skeletons render without layout jump.
- **Priority:** Medium

### UI-002 — Desktop layout
- **Steps:** Test width >=1024px.
- **Expected:** Widget list left; editor/preview right.
- **Priority:** High

### UI-003 — Mobile layout
- **Steps:** Test width <480px.
- **Expected:** Columns stack; no horizontal overflow; controls reachable.
- **Priority:** High

### UI-004 — Tablet layout
- **Steps:** Test 768px.
- **Expected:** Form remains readable and wraps correctly.
- **Priority:** Medium

### UI-005 — Long widget name
- **Steps:** Create max-length widget name.
- **Expected:** List truncates without overlapping status badge.
- **Priority:** Medium

### UI-006 — Long allowed origins list
- **Steps:** Add many origins.
- **Expected:** Textarea remains usable; save buttons visible.
- **Priority:** Medium

### UI-007 — Color controls
- **Steps:** Change color picker and hex text inputs.
- **Expected:** Preview updates; invalid colors rejected on save.
- **Priority:** High

### UI-008 — Panel width bounds
- **Steps:** Enter below 280 and above 420; save.
- **Expected:** Frontend clamps; API enforces min/max.
- **Priority:** Medium

### UI-009 — Border radius bounds
- **Steps:** Enter below 0 and above 32; save.
- **Expected:** Frontend clamps; API enforces min/max.
- **Priority:** Medium

### UI-010 — Dark mode
- **Steps:** Switch console dark mode; open tab.
- **Expected:** Forms, preview, snippet, badges readable.
- **Priority:** Medium

### UI-011 — Embed snippet overflow
- **Steps:** Inspect snippet card.
- **Expected:** Code scrolls horizontally; page does not overflow.
- **Priority:** Medium

### UI-012 — Toast and loading states
- **Steps:** Create/update/delete under slow network.
- **Expected:** Buttons show loading; duplicate submits prevented; toast result clear.
- **Priority:** High

---

## Public widget UI / visual tests

### WUI-001 — Shadow DOM isolation
- **Steps:** Host page uses aggressive CSS for buttons/body.
- **Expected:** Widget visual styling remains intact.
- **Priority:** Critical

### WUI-002 — Position variants
- **Steps:** Test bottom-right, bottom-left, top-right, top-left.
- **Expected:** Widget anchors 24px from configured edges; panel direction is correct.
- **Priority:** High

### WUI-003 — Launcher size variants
- **Steps:** Test compact, comfortable, large.
- **Expected:** Launcher heights approximately 48/56/64px.
- **Priority:** Medium

### WUI-004 — Narrow viewport
- **Steps:** Test 320px width.
- **Expected:** Panel width is limited to `100vw - 32px`; no horizontal scroll.
- **Priority:** Critical

### WUI-005 — Long public text
- **Steps:** Use max-length brand/action/welcome/status text.
- **Expected:** Title truncates; body wraps; buttons remain usable.
- **Priority:** High

### WUI-006 — HTTPS avatar renders
- **Steps:** Set valid HTTPS avatar image.
- **Expected:** Circular avatar image renders.
- **Priority:** Medium

### WUI-007 — Unsafe avatar rejected
- **Steps:** Use `http://`, `javascript:`, or invalid URL.
- **Expected:** Widget falls back to orb.
- **Priority:** High

### WUI-008 — Attribute text overrides
- **Steps:** Add `brand-name`, `action-text`, `welcome-text`, etc.
- **Expected:** Attribute values override server theme within max lengths.
- **Priority:** High

### WUI-009 — Attribute color overrides
- **Steps:** Add valid/invalid color attrs.
- **Expected:** Valid hex applies; invalid value ignored.
- **Priority:** High

### WUI-010 — Open by default from theme
- **Preconditions:** `defaultOpen=true`.
- **Expected:** Panel visible on load.
- **Priority:** Medium

### WUI-011 — Open by attribute
- **Steps:** Add `open="true"`.
- **Expected:** Panel visible regardless of theme default.
- **Priority:** Medium

### WUI-012 — Consent block
- **Steps:** Toggle consent required.
- **Expected:** Consent checkbox/text present only when required and not live.
- **Priority:** High

### WUI-013 — Whitelabel true
- **Expected:** Powered by QuickVoice hidden.
- **Priority:** Medium

### WUI-014 — Whitelabel false
- **Expected:** Powered by QuickVoice visible.
- **Priority:** Medium

---

## API / backend tests

### API-001 — List widgets
- **Request:** `GET /api/v1/agents/:agentId/widgets`
- **Expected:** 200, newest-first list.
- **Priority:** Critical

### API-002 — Create widget
- **Request:** `POST /api/v1/agents/:agentId/widgets`
- **Expected:** 201, response includes `widgetId`, `embed.scriptUrl`, `embed.snippet`.
- **Priority:** Critical

### API-003 — Get widget by id
- **Request:** `GET /api/v1/widgets/:widgetId`
- **Expected:** 200 same org; 404 other org/not found.
- **Priority:** High

### API-004 — Patch widget
- **Request:** `PATCH /api/v1/widgets/:widgetId`
- **Expected:** 200 and updated values.
- **Priority:** Critical

### API-005 — Delete widget
- **Request:** `DELETE /api/v1/widgets/:widgetId`
- **Expected:** 200; subsequent get/list excludes it.
- **Priority:** Critical

### API-006 — Permission enforcement
- **Steps:** Use user without `agentWidget` permissions.
- **Expected:** Read/create/update/delete denied appropriately.
- **Priority:** Critical

### API-007 — Public config allowed
- **Request:** `GET /api/v1/public/widgets/:id/config` with allowed `Origin`.
- **Expected:** 200; CORS header echoes origin.
- **Priority:** Critical

### API-008 — Public config disallowed
- **Request:** Same from disallowed origin.
- **Expected:** CORS forbidden or not available.
- **Priority:** Critical

### API-009 — Public config disabled widget
- **Preconditions:** Widget disabled.
- **Expected:** 404 Widget not found.
- **Priority:** Critical

### API-010 — Public config inactive/unconfigured agent
- **Preconditions:** Widget enabled but agent inactive or unconfigured.
- **Expected:** 404 Widget not found.
- **Priority:** Critical

### API-011 — Public preflight allowed
- **Request:** OPTIONS public config/session URL from allowed origin.
- **Expected:** 204 with CORS headers.
- **Priority:** Critical

### API-012 — Public preflight denied
- **Request:** OPTIONS from disallowed origin.
- **Expected:** 403.
- **Priority:** Critical

### API-013 — Create public session
- **Request:** `POST /api/v1/public/widgets/:id/sessions`
- **Expected:** 201 with `sessionId`, `endToken`, `livekitUrl`, `roomName`, participant token, `expiresAt`.
- **Priority:** Critical

### API-014 — Dynamic variables
- **Request body:** `{ "dynamicVariables": { "first_name": "Aman" } }`
- **Expected:** AI payload renders first/system prompt with value where template uses `{{first_name}}`.
- **Priority:** High

### API-015 — Dynamic variable sanitation
- **Steps:** Send invalid keys, empty values, >500 char values.
- **Expected:** Invalid/empty omitted; long values trimmed to 500 chars.
- **Priority:** High

### API-016 — End session valid token
- **Request:** `POST /api/v1/public/widgets/:id/sessions/:sessionId/end`
- **Expected:** 200 `{ status: "ended", roomName }`; DB status ENDED.
- **Priority:** Critical

### API-017 — End session invalid token
- **Expected:** 404; room not deleted.
- **Priority:** Critical

### API-018 — Widget script static headers
- **Request:** `GET /widget/v1/quickvoice-widget.js`
- **Expected:** Cache headers, wildcard CORS, cross-origin resource policy.
- **Priority:** High

---

## Accessibility tests

### A11Y-001 — Admin keyboard navigation
- **Steps:** Tab to Website widget tab and activate.
- **Expected:** Focus visible; tab opens.
- **Priority:** Critical

### A11Y-002 — Admin form labels
- **Expected:** Inputs/selects/switches have visible labels and accessible names.
- **Priority:** High

### A11Y-003 — Admin save/delete keyboard operation
- **Expected:** Actions reachable without mouse.
- **Priority:** High

### A11Y-004 — Public launcher keyboard operation
- **Steps:** Tab to launcher; press Enter/Space.
- **Expected:** Panel toggles; `aria-expanded` updates.
- **Priority:** Critical

### A11Y-005 — Public close button
- **Expected:** Has aria-label `Close widget`; closes by keyboard.
- **Priority:** Critical

### A11Y-006 — Consent checkbox keyboard
- **Expected:** Space toggles checkbox and enables/disables Start.
- **Priority:** Critical

### A11Y-007 — Public status announcement
- **Expected:** Panel `aria-live="polite"` announces status changes.
- **Priority:** High

### A11Y-008 — Contrast default theme
- **Expected:** Default launcher, panel, status, consent, errors meet WCAG AA.
- **Priority:** High

### A11Y-009 — Reduced motion
- **Steps:** Enable prefers-reduced-motion.
- **Expected:** Hover transform transition disabled.
- **Priority:** Medium

### A11Y-010 — Touch target sizes
- **Expected:** Launcher and primary controls are at least 44px tall.
- **Priority:** High

---

## Error / resilience tests

### ERR-001 — Widget asset unavailable
- **Expected:** Host page does not crash; widget simply fails to initialize.
- **Priority:** High

### ERR-002 — Missing widget id
- **Expected:** Error “Widget id is missing.”
- **Priority:** High

### ERR-003 — Invalid widget id
- **Expected:** Error “Widget is unavailable.” or API message.
- **Priority:** Critical

### ERR-004 — Malformed config response
- **Expected:** Error “Malformed widget response.”
- **Priority:** High

### ERR-005 — Offline before config
- **Expected:** Error state; host page still works.
- **Priority:** High

### ERR-006 — Microphone denied
- **Expected:** Local cleanup; clear error; user can retry.
- **Priority:** Critical

### ERR-007 — AI/session API unavailable
- **Expected:** Start fails, mic stops, error shown.
- **Priority:** Critical

### ERR-008 — LiveKit connect failure
- **Expected:** Local track stopped; no stuck mic; error shown.
- **Priority:** Critical

### ERR-009 — LiveKit reconnect
- **Expected:** State changes to connecting, then live or ended.
- **Priority:** High

### ERR-010 — End endpoint fails
- **Expected:** Local call still ends; server cleanup failure swallowed.
- **Priority:** High

### ERR-011 — Admin API create/update failure
- **Expected:** Toast error; form values preserved.
- **Priority:** High

### ERR-012 — Admin delete failure
- **Expected:** Toast error; widget remains in list.
- **Priority:** High

---

## Security tests

### SEC-001 — Exact origin matching
- **Steps:** Allow `https://example.com`; test `https://www.example.com`.
- **Expected:** `www` rejected unless explicitly allowed.
- **Priority:** Critical

### SEC-002 — Wildcard origin rejected
- **Expected:** `https://*.example.com` rejected.
- **Priority:** Critical

### SEC-003 — Path/query/hash origin rejected
- **Expected:** Any non-origin URL rejected.
- **Priority:** Critical

### SEC-004 — Public requests omit credentials
- **Expected:** No console auth cookies sent.
- **Priority:** Critical

### SEC-005 — LiveKit token not exposed in DOM/storage
- **Expected:** Token only in JS memory; not in DOM/localStorage.
- **Priority:** Critical

### SEC-006 — End token not exposed in DOM/storage
- **Expected:** Raw token not in DOM/localStorage; DB stores hash only.
- **Priority:** Critical

### SEC-007 — XSS in text fields
- **Steps:** Use `<img src=x onerror=alert(1)>` in brand/welcome/action text.
- **Expected:** Escaped as text; no script executes.
- **Priority:** Critical

### SEC-008 — XSS in config response
- **Expected:** `escapeHtml` prevents execution.
- **Priority:** Critical

### SEC-009 — Unsafe avatar URL rejected
- **Expected:** `javascript:`, `data:`, `http:` rejected/fallback.
- **Priority:** Critical

### SEC-010 — CSS injection via color rejected
- **Expected:** Only `#RRGGBB` accepted.
- **Priority:** Critical

### SEC-011 — Cross-org admin access
- **Expected:** Other org cannot read/update/delete widget.
- **Priority:** Critical

### SEC-012 — Rate limit privacy
- **Expected:** Redis key hashes origin/IP.
- **Priority:** Medium

---

## Integration tests

### INT-001 — AI voice session metadata
- **Expected:** Payload has `mode=widget`, `source=web_widget`, `widget_id`, `session_id`, `origin`, `direction=inbound`, `provider=WEB_WIDGET`.
- **Priority:** Critical

### INT-002 — Widget dynamic variables in prompt
- **Expected:** AI worker uses widget `first_message` and `system_prompt` metadata with resolved variables.
- **Priority:** Critical

### INT-003 — Call log identity
- **Expected:** Call log provider `WEB_WIDGET`, source `web_widget`, no fake caller id, empty from/to numbers.
- **Priority:** Critical

### INT-004 — Call appears in console logs
- **Expected:** Completed widget call visible in Call logs.
- **Priority:** High

### INT-005 — Live calls dock compatibility
- **Expected:** Live call UI does not crash for no-phone web widget calls.
- **Priority:** High

### INT-006 — Delete widget during active session
- **Expected:** Current call ends gracefully; future sessions fail.
- **Priority:** Medium

### INT-007 — Agent inactive after widget enabled
- **Expected:** New public config/session fail.
- **Priority:** High

### INT-008 — Multiple widgets for same agent
- **Expected:** Separate themes/origins/sessions/snippets.
- **Priority:** High

### INT-009 — Multiple widgets on same page
- **Expected:** Each custom element maintains separate state.
- **Priority:** Medium

---

## Performance tests

### PERF-001 — Widget bundle size baseline
- **Expected:** Record minified/gzip size after build; flag large regressions.
- **Priority:** Medium

### PERF-002 — Time to launcher visible
- **Expected:** Launcher appears quickly after script/config load.
- **Priority:** High

### PERF-003 — Slow 3G behavior
- **Expected:** Loading/error states clear; host page responsive.
- **Priority:** Medium

### PERF-004 — Repeated mount/unmount
- **Steps:** Add/remove custom element 50 times.
- **Expected:** `disconnectedCallback` cleans call resources; no leaks.
- **Priority:** Critical

### PERF-005 — Repeated start/end
- **Steps:** Start/end multiple calls within limits.
- **Expected:** No accumulating audio nodes/tracks/rooms.
- **Priority:** Critical

### PERF-006 — Rate limit
- **Expected:** Above limit returns 429 friendly error.
- **Priority:** High

### PERF-007 — Concurrent session limit
- **Expected:** Above active limit returns 429 friendly error.
- **Priority:** High

---

## Production smoke flow

1. Confirm DB migration deployed.
2. Confirm widget asset deployed: `https://api.quickvoice.co/widget/v1/quickvoice-widget.js` returns 200.
3. Login to console.
4. Open active configured agent.
5. Open Website widget tab.
6. Create widget disabled first.
7. Add exact production test origin.
8. Enable widget and save.
9. Copy embed snippet.
10. Paste on test site before `</body>`.
11. Open test site in incognito.
12. Confirm public config request succeeds with CORS.
13. Accept consent.
14. Start call and allow microphone.
15. Speak to the agent.
16. End call.
17. Confirm call log is created with `WEB_WIDGET` and no fake phone numbers.
18. Disable widget and confirm public site can no longer start a new call.

---

## Regression checklist

- [ ] Website widget tab appears.
- [ ] List widgets loads.
- [ ] Create disabled widget works.
- [ ] Enabled widget requires valid origin.
- [ ] Enabled widget requires configured agent.
- [ ] Invalid origins rejected.
- [ ] Theme/text preview updates.
- [ ] Save persists all fields.
- [ ] Delete works.
- [ ] Copy snippet works.
- [ ] Static widget script loads.
- [ ] Public CORS works only for allowed origin.
- [ ] Consent blocks/enables Start.
- [ ] Public LiveKit call starts.
- [ ] End call cleans mic and server session.
- [ ] Rate/concurrency limits work.
- [ ] XSS payloads are escaped.
- [ ] Call logs store `WEB_WIDGET` correctly.

---

## Minimal Playwright skeleton

```ts
import { test, expect } from "@playwright/test";

test.describe("Website widget admin", () => {
  test.beforeEach(async ({ page }) => {
    // await login(page);
  });

  test("creates disabled widget and copies snippet", async ({ page }) => {
    await page.goto("/agents/AGENT_ID?tab=widget");
    await page.getByLabel(/widget name/i).fill("Website widget QA");
    await page.getByRole("button", { name: /create widget/i }).click();
    await expect(page.getByText(/widget created/i)).toBeVisible();
    await expect(page.getByText(/quickvoice-widget/i)).toBeVisible();
    await page.getByRole("button", { name: /copy/i }).click();
    await expect(page.getByText(/embed snippet copied/i)).toBeVisible();
  });

  test("rejects enabling without origin", async ({ page }) => {
    await page.goto("/agents/AGENT_ID?tab=widget");
    await page.getByLabel(/enabled/i).click();
    await page.getByRole("button", { name: /create widget/i }).click();
    await expect(page.getByText(/allowed origin|add at least one/i)).toBeVisible();
  });
});

test.describe("Public quickvoice-widget", () => {
  test("loads and toggles", async ({ page }) => {
    await page.goto("http://localhost:3005/widget-test.html");
    await expect(page.locator("quickvoice-widget")).toBeVisible();
    const expanded = await page.locator("quickvoice-widget").evaluate((el) => {
      const root = (el as HTMLElement).shadowRoot!;
      const button = root.querySelector('[data-action="toggle"]') as HTMLButtonElement;
      button.click();
      return button.getAttribute("aria-expanded");
    });
    expect(expanded).toBeTruthy();
  });

  test("blocks start until consent accepted", async ({ page }) => {
    await page.goto("http://localhost:3005/widget-test.html");
    const disabled = await page.locator("quickvoice-widget").evaluate((el) => {
      const root = (el as HTMLElement).shadowRoot!;
      (root.querySelector('[data-action="toggle"]') as HTMLButtonElement).click();
      return (root.querySelector('[data-action="start"]') as HTMLButtonElement).disabled;
    });
    expect(disabled).toBe(true);
  });
});
```
