# Authenticated console UX and frontend logic Testing Guide

## Intern Testing Orientation

This guide covers only `apps/console` at repository commit `3489a213063743d1c3a5a0465c327150d847097a`. The console is the authenticated QuickVoice SaaS application: auth screens, onboarding, tenant switching, dashboard, agents, calls, numbers, knowledge base, outbound calls, tools/MCP, settings, billing, API keys, roles, and responsive/accessibility behavior.

Use this rule for results: mark a check **Pass** only when the expected UI, network request, data change, and user-facing state are all correct. Mark **Fail** when the feature is available but behaves incorrectly. Mark **Blocked** when required credentials, paid vendors, seed data, or local services are unavailable.

Capture evidence for every fail or blocked check: route, browser, viewport, account email, org slug/id, role, exact action, screenshot, console error, Network tab URL/status/body, server `requestId` if present, and relevant service readiness output from `/api/v1/ready`.

## Module Overview

The console app lives in `apps/console` and is a Next.js App Router app. Main source areas:

| Area | Files |
|---|---|
| App shell and providers | `apps/console/src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/providers/query-provider.tsx` |
| Auth/session | `src/lib/server-session.ts`, `src/lib/auth-client.ts`, `src/app/(auth)/*` |
| API client | `src/lib/api/client.ts`, `src/lib/api/resources/*`, `src/lib/api-error-state.ts` |
| Permissions | `src/lib/permissions.ts` |
| Navigation | `src/components/app-sidebar.tsx`, `src/components/topbar.tsx`, `src/components/nav-main.tsx`, `src/components/org-switcher.tsx`, `src/components/nav-user.tsx` |
| Feature routes | `src/app/(app)/dashboard`, `agents`, `calls`, `numbers`, `kb`, `outbound`, `tools`, `settings` |
| Console tests | `apps/console/tests/*.test.mjs` |

Primary routes to test:

| Route | Purpose |
|---|---|
| `/` | Redirects unauthenticated users to `/login`, users without active org to `/orgs`, users with active org to `/dashboard` |
| `/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password` | Auth UX |
| `/orgs`, `/orgs/create`, `/orgs/[id]` | Onboarding and organization selection |
| `/dashboard` | SaaS operational summary |
| `/agents`, `/agents/[id]` | Agent list, creation, config, tools, KB, danger actions |
| `/calls`, `/calls/[id]` | Call logs, transcripts, metadata, recordings |
| `/numbers` | Purchased numbers and routing |
| `/outbound` | Quick outbound calls and batch campaigns |
| `/kb` | Knowledge source upload/list/delete |
| `/tools` | HTTP tools and MCP marketplace/connections |
| `/settings/profile`, `/settings/organization`, `/settings/billing`, `/settings/api-keys`, `/settings/roles`, `/settings/danger` | Account, tenant, billing, roles, API key, and destructive settings |

## Architecture And Data Flow Testing

1. Session and routing flow:
   - Console server components call `GET /api/v1/auth/get-session` through `apps/console/src/lib/server-session.ts`, forwarding cookies and `user-agent` with `cache: no-store`.
   - Pass: an unauthenticated visit to `/dashboard`, `/agents`, `/calls`, `/numbers`, `/kb`, `/outbound`, `/tools`, or `/settings/profile` redirects to `/login`.
   - Pass: a signed-in user with no active organization lands on `/orgs`.
   - Pass: a signed-in user with active organization lands on `/dashboard`.
   - Fail: protected content flashes sensitive tenant data before redirect, or a user without active org can reach app routes.

2. API client flow:
   - `apps/console/src/lib/links.ts` builds API URLs as `${NEXT_PUBLIC_SERVER_URL}/api/${NEXT_PUBLIC_API_VERSION}`.
   - `apps/console/src/lib/api/client.ts` uses axios with `withCredentials: true`; browser `401` responses redirect to `/login`.
   - Pass: API calls use `/api/v1/...` when `NEXT_PUBLIC_API_VERSION=v1`.
   - Pass: expired sessions return to `/login` and do not leave stale protected UI interactive.
   - Fail: requests omit cookies, hit the wrong base URL, or silently ignore `401/403/5xx` errors.

3. Tenant isolation and organization switching:
   - `OrgSwitcher` calls `authClient.organization.setActive`, clears React Query cache with `queryClient.clear()`, then refreshes the router.
   - Pass: after switching organizations, dashboard, agents, calls, numbers, KB, tools, billing, and roles show only the new organization’s data.
   - Fail: any resource from the previous organization remains visible after switch or browser refresh.

4. RBAC boundary:
   - Console permissions mirror server resources in `apps/console/src/lib/permissions.ts`: `agent`, `agentConfiguration`, `phoneNumber`, `knowledgeSource`, `callLogs`, `outboundCalls`, `campaigns`, `tools`, `secrets`.
   - Server built-ins: `owner`, `admin`, `member`.
   - Pass: owners/admins can use management actions; members are read-mostly and cannot mutate agents, numbers, KB, tools, roles, or org danger actions.
   - Fail: a member can create/update/delete restricted resources, or a forbidden user sees success UI after a `403`.

5. Upload and async processing flow:
   - KB file uploads use `GET /kb/upload-url`, direct `PUT` to S3, then `POST /kb`.
   - Outbound batch uploads use `GET /outbound-calls/batch-upload-url`, direct `PUT` to S3, then `POST /outbound-calls/batches`.
   - KB ingestion uses Redis/BullMQ worker `kb-ingest` and AI API `${AI_API_URL}/kb/process`.
   - Pass: upload progress, success, processing, active, and error states are visible and recoverable.
   - Blocked: file upload checks are blocked without S3-compatible credentials and reachable AI API.

6. Server-side dependencies:
   - Health: `GET http://localhost:5000/api/v1/health`.
   - Readiness: `GET http://localhost:5000/api/v1/ready`.
   - Pass: `/ready` clearly reports database, Redis, S3, Stripe, Twilio, Telnyx, LiveKit, and Smithery readiness.
   - Fail: console shows generic failures when readiness identifies a specific missing service and no operator clue is available.

## Setup And Required Services

Minimum local setup:

```bash
corepack prepare pnpm@9.0.0 --activate
task env:dev
task deps:node
task docker:up
task db:migrate
```

Start services:

```bash
task server:dev
task console:dev
```

Optional email service:

```bash
task mail:up
```

Default local URLs proven from repo configuration:

| Service | URL |
|---|---|
| Console | `http://localhost:3000` from `Taskfile.yml` `CONSOLE_PORT:-3000` |
| Server API | `http://localhost:5000` |
| API docs JSON | `http://localhost:5000/api/v1/docs.json` |
| Swagger docs | `http://localhost:5000/api/v1/docs` |
| Health | `http://localhost:5000/api/v1/health` |
| Readiness | `http://localhost:5000/api/v1/ready` |
| Mailpit | `http://localhost:8025` when `task mail:up` is running |

Important environment variables:

| File | Variables |
|---|---|
| `apps/console/.env.dev.example` | `NEXT_PUBLIC_SERVER_URL=http://localhost:5000`, `NEXT_PUBLIC_CONSOLE_URL=http://localhost:3001`, `NEXT_PUBLIC_API_VERSION=v1`, `NEXT_PUBLIC_LANDING_URL=http://localhost:3000` |
| root `.env.dev.example` | `SERVER_PORT=5000`, `CONSOLE_PORT=3000`, `WEB_PORT=3001`, `POSTGRES_PORT=5432`, `REDIS_PORT=6379`, `AI_API_ENABLED=true`, `AI_API_PORT=5555`, `AI_WORKER_ENABLED=false` |
| `apps/server/.env.dev.example` | `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `INTERNAL_API_KEY`, Google OAuth, LiveKit, Twilio, Telnyx, S3, Stripe, SMTP/Mailpit, Smithery |

Setup pass/fail:
- Pass: console loads, server health returns `200`, migrations complete, and unauthenticated `/dashboard` redirects to `/login`.
- Fail: console uses the wrong local origin because `NEXT_PUBLIC_CONSOLE_URL` conflicts with `CONSOLE_PORT`; record actual env values and redirect URL.
- Blocked: vendor-dependent tests are blocked until required credentials are configured.

## Automated Test Commands

Run from the repository root unless noted.

| Command | Purpose | Pass criteria |
|---|---|---|
| `pnpm --filter console check-types` | Type-check console | Exits `0` with no TypeScript errors |
| `pnpm --filter console lint` | Lint console | Exits `0`; `--max-warnings=0` means warnings fail |
| `node --test apps/console/tests/*.test.mjs` | Console source-level regression tests | All tests pass |
| `pnpm --filter console build` | Production Next.js build | Exits `0`; note this writes `.next` |
| `curl -i http://localhost:5000/api/v1/health` | API health | HTTP `200` |
| `curl -i http://localhost:5000/api/v1/ready` | Dependency readiness | HTTP `200` when all required services are configured, otherwise `503` with useful dependency details |
| `pnpm check:tasks && pnpm check:configs` | Repo task/config validation | Exits `0` |
| `pnpm --filter server test` | Server tests affecting console contracts | Exits `0` |
| `pnpm test` | Root test script | Exits `0`; includes Node tests and server tests |
| `pnpm ci:local` | Broad local CI | Exits `0`; may require Docker, Python, and vendor-like env |

Do not treat skipped vendor behavior as passed. If a command cannot run because Postgres, Redis, Python, Docker, S3, Stripe, LiveKit, Twilio, Telnyx, Smithery, or AI API is missing, mark the relevant automated check **Blocked** and include the missing dependency.

## Functional Test Cases

1. Auth login:
   - Test `/login` with invalid email, password shorter than 6, valid but wrong credentials, remember-me toggle, password visibility toggle, forgot-password link, register link, and Google OAuth button.
   - Pass: inline validation appears, submit disables while loading, wrong credentials show an error/toast, password toggle works, successful email login routes to `/dashboard` or `/orgs` based on active organization.
   - Fail: double submit creates duplicate requests, invalid data is sent, server-unreachable errors are blank, or successful login lands on the wrong tenant.
   - Blocked: Google OAuth is blocked without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

2. Registration and email verification:
   - Test `/register` with name shorter than 5, bad email, password shorter than 6, mismatched confirm password, email registration, and Google signup.
   - Pass: validation blocks bad inputs; successful email registration routes to `/verify`; `/verify` clearly tells user to check email and links back to `/login`.
   - Fail: mismatched passwords submit, success does not route to verify, or unverified email can access protected routes when verification is required.
   - Blocked: live email delivery is blocked without SMTP/ZeptoMail; use Mailpit if configured.

3. Forgot and reset password:
   - Test `/forgot-password`, Mailpit reset email, `/reset-password?token=...`, missing token, `?error=INVALID_TOKEN`, short new password, mismatched confirmation, and successful reset.
   - Pass: request shows inbox success state; missing/invalid token shows “Reset link is invalid or expired”; valid reset returns to `/login`.
   - Fail: reset accepts missing token, password errors are unclear, or token appears in logs/UI beyond the URL.
   - Blocked: reset email is blocked without configured mail service.

4. Organization onboarding:
   - Test `/orgs` with no orgs, one org, multiple orgs, slow org list, org selection, `/orgs/create`, and `/orgs/[id]`.
   - Pass: no-org state offers create; exactly one org auto-selects; multiple orgs show picker; create requires non-empty name and generated slug; success routes to `/orgs/{id}`; org detail handles loading, error, and not found.
   - Fail: create reports success without returned org id, selection leaves old org data visible, or non-members can inspect an org detail page.

5. App shell navigation:
   - Test sidebar links for Dashboard, Agents, Phone numbers, Outbound, Call logs, Knowledge base, Tools, and Settings subroutes.
   - Pass: active nav state is correct, mobile sidebar opens/closes, clicking a nav item on mobile closes the sheet, theme menu works, sign out routes to `/login`.
   - Fail: mobile nav traps focus incorrectly, route changes leave stale active state, or sign out leaves protected data on screen.

6. Dashboard:
   - Test `/dashboard?range=24h`, `7d`, `30d`, invalid range, refresh button, offline mode, stale data banner, partial data notice, KPI cards, charts, recent calls, empty dashboard, `401`, and `403`.
   - Pass: invalid range defaults to `7d`; range switch updates URL; refresh is disabled offline; permission errors use role-aware copy; charts expose accessible hidden data tables; KPI links route to `/calls` with expected filters.
   - Fail: dashboard hides API errors as empty state, offline refresh stays enabled, charts have no non-visual equivalent, or drilldown filters are dropped.
   - Verify dashboard `range` drilldowns are converted to stable ISO `from`/`to` filters and calendar dates cover the full selected local day.

7. Agents list:
   - Test `/agents` loading skeleton, empty state, create dialog, template selection (`business`, `medical`, `blank`, `support`), name validation, active toggle, configured chip, pagination, mobile cards, desktop table, row navigation, edit menu, and delete dialog.
   - Pass: create sends selected `templateId`, routes to `/agents/{id}?tab=behavior`, active toggle persists, empty/error states offer retry or create, mobile and desktop layouts both expose key actions.
   - Fail: template choice is ignored, toggle changes UI without server persistence, table controls resize unexpectedly, or delete reports success when the resource remains.
   - Verify agent deletion unlinks provider/LiveKit number bindings and removes KB storage/vector assets before deleting the database row.

8. Agent detail and configuration:
   - Test `/agents/[id]` tabs: behavior, voice, webhooks, tools, knowledge, limits, advanced.
   - Pass: behavior requires first message min 5 and system prompt min 10; voice saves language/model/voice/timezone; webhook URL is required when enabled; tools attach/detach; KB tab links to knowledge base; limits tab clearly says plan-managed; advanced pause/resume persists.
   - Fail: invalid webhook URL saves, unsaved changes disappear without feedback, inactive state does not match list view, or limits imply unsupported editing.

9. Calls list:
   - Test `/calls` filters for agent, status, direction, from date, to date, clear filters, column visibility, pagination, row-per-page, transcript sheet, metadata sheet, audio playback, delete dialog, loading, empty, error, and mobile cards.
   - Pass: filters update results; empty state says no calls match filters; pagination is stable; transcript load-more works; metadata handles missing extracted/evaluation data; delete removes call and refetches.
   - Fail: date filters send an invalid API format without user feedback, cursor pagination duplicates/skips rows, or recording download opens without `rel="noreferrer"`.

10. Call detail:
   - Test `/calls/[id]` for completed call, in-progress call, missing call, no recording, no transcript, extracted data JSON, evaluation JSON, and delete.
   - Pass: header shows caller/status/direction/duration/agent/id; audio empty state appears when no recording; transcript empty state appears when none; delete removes object-storage audio and retained transcript/PII content.
   - Fail: missing call crashes, transcript speaker labels are wrong, or destructive cleanup failure still hides the call.

11. Numbers:
   - Test `/numbers` loading, empty, error retry, search drawer, provider `twilio`/`telnyx`, country uppercase, area code, result list, buy action, assignment select, unassign, copy number, provider chips, unassigned banner, mobile cards.
   - Pass: search calls `GET /numbers/search?provider&country&areaCode&limit`; buy sends lowercase provider and E.164 number; assignment sends `PATCH /numbers/{phId}` with UUID or `null`; copy state resets.
   - Fail: invalid country/area code submits, assignment changes UI before persistence, or unassigned numbers are hidden.
   - Blocked: real search/buy is blocked without Twilio or Telnyx credentials.

12. Knowledge base:
   - Test `/kb` loading, empty, error retry, URL upload, file upload, required agent, source status chips, delete dialog, mobile cards, and desktop table.
   - Pass: URL requires valid name and URL; file path requires selected agent and supported MIME/ext; upload obtains signed URL before `PUT`; create KB record triggers processing; statuses `PROCESSING`, `ACTIVE`, and `ERROR` are clear.
   - Fail: file upload proceeds without active org/user, unsupported file appears accepted, delete removes wrong source, or failed processing has no visible status.
   - Blocked: file upload and active processing are blocked without S3 and AI API.

13. Outbound quick call:
   - Test `/outbound` Quick call tab with no outbound-ready agents, active configured agent with assigned number, invalid phone, optional name, first message, system prompt override, success region, and retry after failure.
   - Pass: form is unavailable until an active configured agent has a number; valid submit calls `POST /outbound-calls/quick`; success names destination and from number.
   - Fail: inactive/unconfigured agents can dial, invalid phone submits, or telephony failure shows success.
   - Blocked: real call dispatch is blocked without LiveKit and telephony provider credentials.

14. Outbound batch:
   - Test campaign name, ring timeout min 10/max 180, agent/from selection, CSV/XLSX upload, schedule now/later, required scheduled date, timezone, success, and campaign list.
   - Pass: upload obtains signed URL then creates batch; later schedule requires `scheduledAt`; campaign list shows status and valid/total counts.
   - Fail: schedule-later submits without date, invalid file type uploads, or failed upload still creates campaign.
   - Known UI risk: badge mentions CSV, XLS, XLSX, but accept/schema are CSV/XLSX-oriented; fail if `.xls` is presented as supported but rejected later.

15. HTTP tools:
   - Test `/tools` HTTP tab, add/edit/delete tool, required name/description/API URL, method enum, headers/query/body/dynamic params, timeout 1-300, path params from `{param}` URL placeholders, linked agents, and detach.
   - Pass: invalid URLs and blank key names are blocked; path params are auto-derived and read-only; create/edit/delete toasts match persistence; linked agents update after attach/detach.
   - Fail: malformed tool config saves, path placeholder is missed, or delete leaves tool attached.

16. MCP marketplace and connections:
   - Test marketplace search, verified filter, sort, page size, pagination, fallback catalog on API failure, custom MCP URL/name connect, setup URL opening, polling refresh, connected list, retry, refresh, disconnect, and agent attach.
   - Pass: unsafe setup URLs are blocked except `https` and localhost HTTP; `window.open` uses noopener/noreferrer; disconnected/error states offer retry; only `CONNECTED` MCPs attach to agents.
   - Fail: unsafe URL opens, fallback catalog looks like live data without warning, or non-connected MCP attaches.
   - Blocked: live Smithery catalog/setup is blocked without `SMITHERY_API_KEY` and namespace.

17. Settings profile:
   - Test name update, unchanged save disabled, email disabled, password current/new/confirm validation, password visibility toggles, and change password success/failure.
   - Pass: name requires min 2; password requires min 8 and matching confirmation; errors are visible and do not clear valid fields.
   - Fail: email editable in profile, password submits without current password, or save button is enabled while pristine.

18. Settings organization:
   - Test org name/slug update, generated slug until manually edited, member invite, member role update, remove member, cancel invitation, loading, and errors.
   - Pass: invite requires valid email and role; destructive member actions require confirmation; roles refresh after custom role changes.
   - Fail: non-admin can invite/remove, slug overwrites a manually edited slug, or pending invitations cannot be cancelled.
   - Blocked: invite email delivery is blocked without mail service.

19. Settings billing:
   - Test free/starter/growth/scale plan cards, current plan detection, upgrade, billing portal, contact sales, and usage display.
   - Pass: current active/trialing subscription is marked; upgrade uses success/cancel URLs based on console origin; portal opens only when backend returns URL; contact sales uses `mailto:sales@quickvoice.ai`.
   - Fail: wrong plan marked current, checkout opens for unavailable price, or portal failure is silent.
   - Blocked: real checkout/portal/metered billing is blocked without Stripe keys and configured prices. Local usage aggregation can still be verified from seeded call durations.

20. Settings API keys:
   - Test list, create with name min 2, one-time key modal, copy, “I’ve saved it”, masked prefix, active/disabled status, created date, and revoke confirmation.
   - Pass: full key is shown only immediately after creation; list uses masked `start`; docs say use `x-api-key`; revoke removes/disables key.
   - Fail: full secret is retrievable later, key is copied without user action, or revoked key still works.
   - Blocked: API-key permission behavior is blocked unless test keys can be configured with explicit permissions.

21. Settings roles:
   - Test built-in owner/admin/member display, custom role create/update/delete, permission matrix keyboard use, checkbox labels, unsupported cells, and duplicate/invalid role names.
   - Pass: built-ins are system roles; custom role names require lowercase pattern; permission changes persist; checkboxes have `aria-label="Allow {resource} {action}"`.
   - Fail: built-ins can be deleted, unsupported permissions save, or checkboxes are inaccessible.
   - Note: code regex allows underscore even though copy mentions dashes; record UX mismatch if shown to users.

22. Settings danger:
   - Test leave organization and delete organization.
   - Pass: leave uses confirmation and routes to `/orgs`; delete requires typing exact `DELETE`; deleted org is inaccessible after refresh.
   - Fail: destructive action runs without confirmation, accepts lowercase/partial confirmation, or leaves deleted org data cached.

## SaaS Business And Operations Test Cases

- Tenant lifecycle:
  - Pass: user can register, create org, invite member, switch org, update settings, and leave/delete org with correct routing.
  - Fail: deleted or left organization still appears as active after refresh.

- Role lifecycle:
  - Pass: owner/admin can grant/revoke roles; member access changes after refresh and new session.
  - Fail: old permissions remain active indefinitely after role downgrade.

- Billing lifecycle:
  - Pass: plan state matches Stripe subscription state when Stripe is configured; failed portal/checkout gives actionable error.
  - Blocked: billing lifecycle is blocked without Stripe secret key, webhook secret, and plan price configuration.

- Customer data boundaries:
  - Pass: agents, calls, numbers, KB, tools, campaigns, roles, and API keys are scoped to active organization.
  - Fail: any resource created in org A is visible or mutable from org B.

- Support handoff:
  - Pass: every user-visible error can be reported with route, request URL, status code, request id if present, org, user, and timestamp.
  - Fail: critical failures only show “Something went wrong” with no retry, request context, or support path.

- Operational monitoring:
  - Pass: `/api/v1/ready` identifies missing Postgres, Redis, S3, Stripe, Twilio, Telnyx, LiveKit, and Smithery dependencies.
  - Fail: readiness is green while a configured dependency is unreachable.

- Retention and auditability:
  - Server retention defaults are transcripts 90 days, recordings detached after 30 days, MCP logs 30 days, failed KB 30 days, with env overrides.
  - Pass: destructive UI copy does not promise retention behavior the backend does not perform.
  - Blocked: audit log review is blocked for intern UI testing because no console audit-log screen is present.

## Integration And API Test Cases

Main console API endpoints:

| Feature | Endpoints |
|---|---|
| Auth/session | `/api/v1/auth/*`, `/api/v1/auth/get-session` |
| Dashboard | `GET /api/v1/dashboard/summary?range=24h|7d|30d` |
| Agents | `GET /agents`, `POST /agents`, `PATCH /agents/{id}`, `GET /agents/{id}/config`, `POST /agents/{id}/config` |
| Calls | `GET /calls`, `GET /calls/{callId}`, `GET /calls/{callId}/transcripts`, `DELETE /calls/{callId}` |
| Numbers | `GET /numbers`, `GET /numbers/search`, `POST /numbers`, `PATCH /numbers/{phId}` |
| KB | `GET /kb`, `POST /kb`, `GET /kb/upload-url`, `DELETE /kb/{kbId}` |
| Outbound | `POST /outbound-calls/quick`, `GET /outbound-calls/batch-upload-url`, `POST /outbound-calls/batches`, `GET /outbound-calls/batches`, `GET /outbound-calls/batches/{campaignId}` |
| HTTP tools | `GET /tools`, `POST /tools`, `PATCH /tools/{toolId}`, `DELETE /tools/{toolId}`, attach/detach agent endpoints |
| MCP | `GET /mcp/catalog`, `GET /mcp/connections`, `POST /mcp/connections`, refresh/delete, agent attach/detach |
| Settings billing/API keys/roles/org | Better Auth organization, API key, admin, and Stripe subscription client methods |

API checks:
- Pass: unauthenticated `GET /api/v1/me` returns `401`.
- Pass: authenticated browser calls include cookies and active organization context.
- Pass: validation failures return useful field errors and the UI maps them to form or toast state.
- Pass: `403` responses show permission-specific UI, not generic empty states.
- Fail: client-supplied `organizationId` or `userId` can override server session context for agents or KB.
- Fail: console expects an endpoint that does not exist, such as current agent deletion.
- Blocked: API key authorization checks are blocked unless a key can be created with explicit permissions metadata.

## Non-Functional Test Cases

- Performance:
  - Pass: initial authenticated dashboard renders useful skeletons quickly; tables paginate instead of rendering unbounded rows; React Query refetches do not create duplicate visible rows.
  - Fail: dashboard charts or call tables freeze the browser with seeded data.

- Reliability:
  - Pass: refresh, retry, offline, and stale states are visible for dashboard, agents, calls, numbers, KB, and tools.
  - Fail: transient network failure leaves disabled controls permanently stuck.

- Resilience:
  - Pass: killing Redis makes readiness fail and queue-backed features show blocked/error states; killing server redirects or errors cleanly.
  - Fail: failed upload/call creation shows success or loses user-entered form data without warning.

- Data integrity:
  - Pass: destructive actions require confirmation and refetch affected lists.
  - Fail: optimistic UI hides failed mutations or creates duplicate resources on double click.

- Concurrency:
  - Test two browser sessions changing the same agent, number assignment, role, or org setting.
  - Pass: final state is consistent after refresh and errors are shown for stale/invalid updates.
  - Fail: both sessions show success while persisted state only reflects one change without notification.

- Rate limits:
  - Server rate limit is 100 requests per 15 minutes per IP.
  - Pass: `429` responses are surfaced as retry-later errors.
  - Fail: console loops aggressively after `429`.

- Compatibility:
  - Pass: Chrome, Firefox, Safari/WebKit, and Edge current stable can complete auth, navigation, forms, tables, dialogs, and file inputs.
  - Fail: any supported browser cannot operate primary flows.

## UX, UI, Accessibility, And Compatibility Testing

- Responsive breakpoints:
  - Test 360x800, 390x844, 768x1024, 1024x768, 1440x900.
  - Pass: no horizontal page scroll except intentional table overflow containers; mobile cards appear for dense tables; dialogs/sheets fit viewport.
  - Fail: buttons/text overlap, destructive dialogs extend off-screen, or cards hide required actions.

- Keyboard:
  - Pass: all forms, tabs, dropdowns, menus, dialogs, sheets, switches, pagination, table actions, role checkboxes, and template cards work without mouse.
  - Fail: focus is lost behind dialogs, Escape does not close dismissible overlays, or tab order skips primary actions.

- Screen reader cues:
  - Pass: icon buttons have accessible names, loading uses appropriate busy/status cues, errors are announced or placed near fields, charts have hidden data tables.
  - Fail: unlabeled action menus, unnamed switches, or chart-only data.

- Visual hierarchy:
  - Pass: destructive actions use alert dialogs and clear copy; disabled buttons explain prerequisites through surrounding UI; empty states provide next action.
  - Fail: primary and destructive actions look equivalent or empty states provide no recovery path.

- Forms:
  - Pass: validation appears before network submission for known client constraints; server validation appears after API rejection; loading states prevent duplicate submission.
  - Fail: required fields are not marked by behavior, server errors clear unrelated fields, or success toasts show before persistence.

- Tables and cards:
  - Pass: desktop tables and mobile cards expose the same critical information and actions.
  - Fail: mobile view cannot delete, edit, assign, inspect metadata, or navigate where desktop can.

- Browser/device:
  - Pass: file picker, clipboard copy, downloads, OAuth popup/redirect, and payment redirects behave correctly on desktop and mobile browsers.
  - Blocked: mobile real-call behavior is blocked unless test devices and telephony credentials are available.

## Security, Privacy, And Compliance Checks

- Authentication:
  - Pass: protected routes redirect unauthenticated users; expired sessions are handled; sign out clears protected UI.
  - Fail: protected data is visible after sign out or in another user’s session.

- Authorization:
  - Pass: member role cannot mutate restricted resources; custom roles enforce selected permission matrix.
  - Fail: hidden UI is the only control and direct API calls still succeed.

- Tenant privacy:
  - Pass: active org switch clears cached data; direct resource URLs from another org return not found/forbidden.
  - Fail: cross-org agents, calls, numbers, KB, tools, campaigns, API keys, or roles leak.

- Secrets:
  - Pass: API keys show full secret only once; webhook/tool/MCP secrets are not printed in UI, logs, or errors; reset tokens are not copied into nonessential logs.
  - Fail: full API key can be retrieved later or secret fields appear in Network responses unnecessarily.

- Upload safety:
  - Pass: KB and outbound uploads require signed URLs, supported file types, and active org/session.
  - Fail: arbitrary file type or unauthenticated upload succeeds.

- External URL safety:
  - Pass: MCP setup opens only safe `https` URLs or local HTTP development URLs with noopener/noreferrer.
  - Fail: arbitrary `javascript:`, insecure remote HTTP, or opener access is allowed.

- Privacy copy:
  - Pass: call delete copy accurately states recordings in object storage are not affected.
  - Fail: UI promises deletion, retention, or audit behavior not implemented.

## Edge Cases And Failure Modes

- Server down:
  - Pass: auth/API actions show reachable error copy and allow retry.
  - Fail: spinner never stops.

- Postgres down:
  - Pass: `/ready` fails and console API errors are visible.
  - Fail: console shows stale data as current without freshness warning.

- Redis down:
  - Pass: queue-backed KB/outbound operations fail or block clearly.
  - Fail: user sees processing forever with no error or operator clue.

- S3 unavailable:
  - Pass: KB/outbound file flows fail before creating unusable records.
  - Fail: record is created after upload URL or `PUT` failure.

- Stripe unavailable:
  - Pass: billing plan cards still render, but checkout/portal show clear errors.
  - Fail: user is redirected to blank/undefined URL.

- Telephony provider unavailable:
  - Pass: number search/buy and outbound calls show provider-specific failure.
  - Fail: failed call is reported as started.

- AI API unavailable:
  - Pass: KB source moves to `ERROR` after worker retries or shows processing failure.
  - Fail: source remains indefinitely active/processing with no signal.

- Large data:
  - Pass: tables paginate calls, agents, KB, tools, numbers, and campaigns without layout collapse.
  - Fail: long names, phone numbers, URLs, or JSON metadata overflow controls.

- Race conditions:
  - Pass: double-click create, delete, assign, and save controls do not duplicate or corrupt data.
  - Fail: duplicate agents/tools/campaigns are created from one user action.

- Invalid deep links:
  - Pass: unknown app route uses not-found flow back to `/dashboard`; missing call/agent/org ids show not found states.
  - Fail: invalid ids crash the app shell.

## Test Data, Fixtures, Accounts, And Roles

Recommended accounts:
- Owner/admin account: create through `/register`, verify email, create organization.
- Member account: invite from `/settings/organization`; verify role restrictions.
- Custom-role account: create role in `/settings/roles`, invite/update user, test exact permissions.
- Multi-org account: same user in at least two organizations to test tenant switching and cache isolation.

Local seed:
- Server seed file: `apps/server/prisma/seed.ts`.
- Documented usage includes `pnpm --filter server seed -- --email you@example.com` or `--org-slug my-workspace`.
- Seeded data includes demo agents, phone numbers, dashboard call history, completed call transcripts, and KB sources.
- Pass: seeded resources appear only in the target user/org.
- Fail: seed creates data without a valid user/org membership or leaks across organizations.
- Blocked: seed is blocked until a local user and organization exist.

Useful role expectations:
- `owner`: full tenant control, billing, roles, danger actions.
- `admin`: broad management access similar to owner for feature resources.
- `member`: read-only for agents, agent config, numbers, KB, call logs, tools, secrets; can create/read outbound calls and read campaigns.

Fixture ideas:
- Agent states: active configured, active unconfigured, paused configured.
- Number states: assigned, unassigned, Twilio, Telnyx.
- Call states: completed with transcript/recording, completed without recording, failed, not answered, in progress, outbound, inbound.
- KB states: processing, active, error, URL source, file source.
- Tool states: unlinked HTTP tool, linked HTTP tool, invalid server URL case.
- MCP states: connected, needs auth, disconnected, error, missing Google Drive scope.
- Billing states: free, trialing, active paid, no Stripe customer.

## External Services Or Blocked Checks

| Service | Needed for | Blocked criteria |
|---|---|---|
| Google OAuth | Google login/signup | Missing `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` |
| SMTP/Mailpit/ZeptoMail | Verification, reset, invites | No local Mailpit or live mail credentials |
| Postgres | All persisted console data | Database not running or migrations not applied |
| Redis | KB/outbound queues, readiness | Redis unavailable |
| S3-compatible storage | KB files, outbound batch files, recordings URLs | Missing bucket/credentials or signed URL failure |
| AI API | KB processing | `AI_API_URL` unreachable or internal key missing |
| Twilio | Number search/buy, telephony | Missing Twilio SID/token/trunk/from number |
| Telnyx | Number search/buy, telephony | Missing Telnyx API key/connection/from number |
| LiveKit | Real-time call dispatch/SIP | Missing LiveKit URL/API/trunk credentials |
| Stripe | Billing checkout, portal, metered usage | Missing Stripe secret, webhook secret, price ids, or customer/subscription |
| Smithery | MCP catalog/connect/setup | Missing Smithery API key or namespace |
| Browser payment/OAuth popups | Redirect/popup flows | Popup blocked by test browser policy |

Every blocked check must include: service name, missing env var or credential, route tested, user/org/role, and what could be tested without that service.

## Regression Risks

- File upload flows can leave unreferenced direct-upload objects if the browser closes after S3 succeeds but before record creation; configure short lifecycle expiration on upload prefixes.
- Role name validation allows underscore by regex although copy emphasizes dashes.
- Query cache isolation depends on clearing React Query during org switch.
- Hidden mobile table/card actions can regress because many pages maintain separate desktop and mobile layouts.
- API-key UI creates keys, but permissioned API-key behavior depends on metadata/permissions not fully exposed in the visible form.

## Release Acceptance Checklist

- [ ] `pnpm --filter console check-types` passes.
- [ ] `pnpm --filter console lint` passes.
- [ ] `node --test apps/console/tests/*.test.mjs` passes.
- [ ] `pnpm --filter console build` passes in CI or a disposable local checkout.
- [ ] `/api/v1/health` returns `200`.
- [ ] `/api/v1/ready` is either green or every missing dependency is documented as blocked.
- [ ] Auth, registration, password reset, and org onboarding pass.
- [ ] Owner/admin/member/custom-role permission scenarios pass.
- [ ] Tenant switching shows no cross-org cached data.
- [ ] Dashboard handles loading, empty, partial, stale, offline, `401`, and `403` states.
- [ ] Agents can be created/configured, and the agent deletion contract issue is resolved or explicitly release-blocked.
- [ ] Calls list/detail filters, transcripts, metadata, recordings, pagination, and delete behavior pass.
- [ ] Numbers search/buy/assign tests pass or vendor checks are blocked with evidence.
- [ ] KB URL/file upload, processing states, and delete tests pass or S3/AI checks are blocked.
- [ ] Outbound quick and batch flows pass or telephony/upload checks are blocked.
- [ ] HTTP tools and MCP marketplace/connection states pass or Smithery checks are blocked.
- [ ] Settings profile, organization, billing, API keys, roles, and danger flows pass.
- [ ] Mobile, keyboard, screen reader, and browser compatibility checks pass.
- [ ] Security checks for session, RBAC, tenant isolation, secrets, uploads, and unsafe URLs pass.
- [ ] All failed or blocked checks include reproducible evidence and owner-ready notes.
