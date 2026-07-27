# API server, auth, data model, and integrations Testing Guide

## Intern Testing Orientation

Test only `apps/server` at commit `3489a213063743d1c3a5a0465c327150d847097a`. The module is an Express API for QuickVoice organizations, agents, phone numbers, call logs, knowledge sources, outbound campaigns, tools, MCP integrations, billing, auth, queues, workers, and provider handoffs.

Use the API base `http://localhost:5000/api/v1` unless `PORT` or `API_VERSION` is changed. The API docs are mounted at `/api/v1/docs` and raw OpenAPI JSON at `/api/v1/docs.json`.

Do not test destructive vendor actions against production accounts. Phone-number purchase/release, outbound calls, Stripe billing, S3 object deletion, and Smithery disconnects can create cost or data loss. Use sandbox/dev credentials only.

## Module Overview

Key files:

- `apps/server/src/index.ts`: Express bootstrap, Helmet, CORS, rate limit, Better Auth handler, health/readiness/docs, Inngest, workers, API router.
- `apps/server/src/router.ts`: mounts `/agents`, `/numbers`, `/calls`, `/dashboard`, `/kb`, `/outbound-calls`, `/tools`, `/mcp`.
- `apps/server/src/lib/auth.ts`: Better Auth with email/password, Google OAuth, admin, API key, organization, and Stripe plugins.
- `apps/server/src/lib/permissions.ts`: RBAC roles `owner`, `admin`, `member`.
- `apps/server/prisma/schema.prisma`: Postgres data model for Better Auth, organizations, billing, agents, numbers, calls, KB, outbound campaigns, tools, MCP, secrets, and audit logs.
- `apps/server/src/modules/*`: route/controller/service/repository modules.
- `apps/server/src/queues/*` and `apps/server/src/workers/*`: BullMQ queues for KB ingestion and outbound batches.
- `apps/server/src/inngest/*`: Inngest functions for KB ingestion and retention.
- `apps/server/.env.dev.example`: proven local environment variables.

Authentication modes:

- Session cookie through Better Auth routes mounted at `/api/v1/auth/*`.
- Organization-scoped API key through `x-api-key`.
- Trusted internal bearer token through `Authorization: Bearer $INTERNAL_API_KEY`. Internal `authMiddleware` calls must also provide `x-user-id` and `x-organization-id`, except routes using `requireInternalApiKey` directly.

RBAC:

- `owner` and `admin`: full CRUD for agents, agent configuration, phone numbers, KB sources, call logs, outbound calls, campaigns, tools, and secrets.
- `member`: read-mostly; can read most resources and create/read outbound calls, but cannot mutate agents, phone numbers, KB, tools, campaigns, or delete call logs.

## Architecture And Data Flow Testing

Test these boundaries:

- Express request flow: `helmet` -> CORS trusted origins -> morgan -> Better Auth routes before JSON parser -> rate limit -> JSON parser -> Inngest -> public routes -> protected module routes -> 404/error envelope.
  - Pass: unauthenticated protected calls return `401` with `{ success:false, code, message, details, fieldErrors, requestId }`.
  - Fail: raw stack traces, inconsistent error shapes, or protected routes reachable without auth.

- Tenant scoping:
  - Pass: all normal user/API-key reads and writes are scoped by `req.auth.activeOrganizationId`; guessed IDs from another org return `404` or `403`.
  - Fail: caller-supplied `organizationId` or `userId` overrides active auth context.

- Data model integrity:
  - Pass: unique constraints hold for `Organization.slug`, `User.email`, `PhoneNumber.number`, `Agent.organizationId_agentSlug`, `Secret.organizationId_name`, `McpServerCatalogItem.organizationId_slug`, `McpConnection.organizationId_smitheryConnectionId`, and `AgentMcpConnection.agentId_mcpConnectionId`.
  - Fail: duplicate rows appear or cross-org foreign keys can be linked.

- Background processing:
  - Pass: KB and outbound batch jobs enter Redis queues, retry up to 3 attempts, and move records to `ACTIVE`, `ERROR`, `IN_PROGRESS`, `FAILED`, or completed campaign states as expected.
  - Fail: jobs stay invisible, retry forever, or leave DB/provider state inconsistent without logs.

- Provider side effects:
  - Pass: phone linking calls carrier binding first, LiveKit binding second, then DB update; failures attempt reverse-order rollback and log critical drift.
  - Fail: DB says linked while carrier/LiveKit failed silently.

## Setup And Required Services

Required local tools:

- Node `>=18`, `corepack`, `pnpm@9.0.0`, Docker, Docker Compose, Go Task.
- In this inspection shell, `pnpm` was not on `PATH`; an intern must run `corepack prepare pnpm@9.0.0 --activate` or use the repo’s Task setup first.

Recommended local setup:

```sh
task doctor
task env:dev
task docker:up
task db:migrate
task server:dev
```

Full stack setup:

```sh
task up:dev
```

Optional email sandbox:

```sh
task mail:up
```

Core local URLs:

- API health: `http://localhost:5000/api/v1/health`
- API readiness: `http://localhost:5000/api/v1/ready`
- API docs: `http://localhost:5000/api/v1/docs`
- Console: `http://localhost:3000`
- Mailpit UI when enabled: `http://localhost:8025`

Required env from `apps/server/.env.dev.example`:

- Core: `NODE_ENV`, `API_VERSION`, `PORT`, `SERVER_URL`, `CONSOLE_URL`, `WEB_URL`
- Data: `DATABASE_URL`, `REDIS_URL`
- Auth: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `INTERNAL_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- LiveKit: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_NAME`, `LIVEKIT_SIP_INBOUND_TRUNK_ID`, `LIVEKIT_SIP_OUTBOUND_TRUNK_TWILIO_ID`, `LIVEKIT_SIP_OUTBOUND_TRUNK_TELNYX_ID`
- Telephony: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_TRUNK_SID`, `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID`
- S3: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`
- Billing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, optional `STRIPE_CALL_MINUTES_METER_EVENT_NAME`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `FROM_EMAIL`, optional `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_URL`
- MCP: `SMITHERY_NAMESPACE`, `SMITHERY_API_KEY`, optional `SMITHERY_RUN_BASE_URL`, `SMITHERY_API_BASE_URL`
- Privacy/retention: `SECRET_ENCRYPTION_KEY`; optional `CALL_LOG_PII_REDACTION`, `TRANSCRIPT_RETENTION_DAYS`, `RECORDING_RETENTION_DAYS`, `MCP_LOG_RETENTION_DAYS`, `FAILED_KB_RETENTION_DAYS`, `RETENTION_CLEANUP_BATCH_SIZE`
- AI/KB and batch limits: optional `AI_API_URL`, `KB_OPS_URL`, `KB_MAX_UPLOAD_BYTES`, `OUTBOUND_BATCH_MAX_UPLOAD_BYTES`, `OUTBOUND_BATCH_MAX_RECIPIENTS`

## Automated Test Commands

Run from repository root after dependencies are installed:

```sh
pnpm --filter server test
pnpm --filter server lint
pnpm --filter server check-types
pnpm test
```

Expected pass criteria:

- `pnpm --filter server test`: Node test suite under `apps/server/tests/**/*.test.ts` passes.
- `pnpm --filter server lint` and `check-types`: TypeScript reports no errors.
- `pnpm test`: root tests plus server tests pass.

Useful read-only checks:

```sh
pnpm --filter server exec prisma validate
curl -i http://localhost:5000/api/v1/health
curl -i http://localhost:5000/api/v1/ready
curl -i http://localhost:5000/api/v1/docs.json
```

Blocked/conditional commands:

- `pnpm --filter server build` writes `apps/server/dist`; run only in a normal dev/release workspace where build output is allowed.
- `task db:migrate` changes the local database.
- `pnpm --filter server seed -- --email you@example.com` appends demo data and requires an existing Better Auth user or org.

## Functional Test Cases

Use an `owner`, `admin`, and `member` in the same organization, plus a second organization for tenant-boundary checks. For API-key tests, create organization-scoped keys with and without route permissions.

- Health/docs:
  - Test `GET /api/v1/health`, `GET /api/v1/docs`, `GET /api/v1/docs.json`.
  - Pass: health returns `200`, docs load, docs JSON includes routes for agents, numbers, calls, KB, outbound calls, tools, and MCP.
  - Fail: docs are stale, missing mounted routes, or Swagger UI stores auth unexpectedly.

- Readiness:
  - Test `GET /api/v1/ready`.
  - Pass: returns `200` only when DB, Redis, S3, Stripe, Twilio, Telnyx, LiveKit, and Smithery checks are `ok`; otherwise returns `503` with per-check `status` and `message`.
  - Fail: dependency failures are hidden or response has no actionable check names.

- Auth verification:
  - Test `GET /api/v1/me` with no auth, session cookie, valid `x-api-key`, invalid `x-api-key`, and internal bearer token.
  - Pass: no/invalid auth gets `401`; valid session/API key succeeds; internal bearer without required user/org context gets `401`.
  - Fail: invalid tokens succeed or active organization is missing but request proceeds.

- Agents:
  - Endpoints: `GET /agents`, `POST /agents`, `PATCH /agents/:id`, `GET /agents/:agentId/config`, `POST /agents/:agentId/config`, internal `GET /agents/internal-config/:agentId`, `GET /agents/number-config/:phoneNumber`.
  - Pass: create accepts `{ name, isActive, templateId }` with template slug `business`, `medical`, `blank`, `support`, UUID, or `null`; duplicate slug in same org returns `400`; config requires first message, system prompt, `llmModel`, `sttModel`, `ttsModel`, voice, RAG flag, timezone, data arrays, webhook objects/nulls, and preemptive flag.
  - Fail: client can set `organizationId`, fetch another org’s agent, save unsafe webhook URLs, or see unredacted secret webhook fields.

- Numbers:
  - Endpoints: `GET /numbers/search`, `GET /numbers`, `POST /numbers`, `PATCH /numbers/:phId`, `DELETE /numbers/:phId`.
  - Pass: provider values normalize from lowercase to `TWILIO`/`TELNYX`; search requires ISO-2 country and max limit 50; buy requires E.164 phone number; link accepts `agentId` UUID or `null`; member cannot buy/update/delete.
  - Fail: unknown provider succeeds, a number links to an agent from another org, or carrier/LiveKit failures leave no error/log.

- Calls:
  - Endpoints: `POST /calls` internal-only, `GET /calls`, `GET /calls/:callId`, `GET /calls/:callId/transcripts`, `DELETE /calls/:callId`.
  - Pass: ingest requires internal bearer path, creates call log and transcripts, redacts caller PII by default, links matching outbound ID best-effort, reports Stripe usage best-effort, list filters by `agentId`, `status`, `direction`, `from`, `to`, `limit`, and `cursor`; delete soft-deletes.
  - Fail: non-internal caller ingests calls, deleted calls remain visible, transcript pagination crosses orgs, or raw phone/email/card/SSN values persist when redaction is enabled.

- Dashboard:
  - Endpoint: `GET /dashboard/summary?range=24h|7d|30d`.
  - Pass: returns totals, deltas, time series, status breakdown, direction breakdown, top agents, and 10 recent calls scoped to active org.
  - Fail: invalid range succeeds, deleted calls count, or another org’s calls affect totals.

- Knowledge base:
  - Endpoints: `GET /kb`, `POST /kb`, `GET /kb/upload-url`, `DELETE /kb/:kbId`.
  - Pass: upload URL requires `fileName` and `contentType`; S3 key starts `kb/{organizationId}/`; URL source requires safe HTTPS URL; file source requires `s3Key`; rows start `PROCESSING`; worker moves to `ACTIVE` or `ERROR`; delete removes DB row and attempts S3/KB cleanup.
  - Fail: local/private URL accepted, source can target another org’s agent, empty documents accepted, or delete leaks active count.

- Outbound calls:
  - Endpoints: `GET /outbound-calls`, `POST /outbound-calls/quick`, `GET /outbound-calls/:outboundId`, `GET /outbound-calls/:outboundId/status`, `POST /outbound-calls/:outboundId/cancel`, `POST /outbound-calls/:outboundId/retry`.
  - Pass: quick call requires configured active agent and linked `fromNumber`; creates `SCHEDULED`, dispatches LiveKit agent and SIP participant, then marks `IN_PROGRESS`; failures mark `FAILED` with reason; cancel only works for `SCHEDULED`; retry only works for `FAILED` or `NOT_ANSWERED`.
  - Fail: exhausted plan minutes still dispatch, unlinked from-number calls, or cancellation of in-progress calls succeeds.

- Outbound batches:
  - Endpoints: `GET /outbound-calls/batch-upload-url`, `POST /outbound-calls/batches`, `GET /outbound-calls/batches`, `GET /outbound-calls/batches/:campaignId`.
  - Pass: upload file must be `.csv` or `.xlsx`; `.xls` parser rejects; CSV/XLSX requires `phone_number`; valid rows become scheduled outbound calls; invalid rows become failed calls with import error; dispatch jobs use BullMQ-safe IDs.
  - Fail: batch routes are shadowed by `/:outboundId`, invalid rows disappear, or scheduled delay ignores `scheduledAt`.

- Tools:
  - Endpoints: `GET /tools`, `POST /tools`, `PATCH /tools/:toolId`, `DELETE /tools/:toolId`, `GET /tools/agent/:agentId`, `POST /tools/:toolId/attach/:agentId`, `DELETE /tools/:toolId/detach/:agentId`.
  - Pass: tool URL must be public HTTPS; headers/dynamic variables with secrets are stored as secret references and redacted on reads; attach/detach updates `toolsCount`.
  - Fail: private URL accepted, secrets returned in cleartext, or cross-org tool attaches.

- MCP:
  - Endpoints: `GET /mcp/catalog`, `GET /mcp/connections`, `POST /mcp/connections`, `POST /mcp/connections/:id/refresh`, `DELETE /mcp/connections/:id`, `GET /mcp/agent/:agentId`, `POST /mcp/connections/:id/attach/:agentId`, `DELETE /mcp/connections/:id/detach/:agentId`, `POST /mcp/connections/:id/tools/:toolName/execute`.
  - Pass: catalog paginates and falls back to curated `github`, `slack`, `notion`, `google-drive`; connect accepts exactly one of `catalogSlug` or `customUrl`; execute logs success/error previews with redaction; Google Drive missing scope moves connection to `AUTH_REQUIRED`.
  - Fail: disconnected or unattached MCP connection can execute, unsafe custom URL accepted, or execution logs store raw secrets.

## SaaS Business And Operations Test Cases

- Onboarding:
  - Pass: new user can verify email, create/join organization, select active organization, and access `/me`.
  - Fail: user without active organization can mutate resources.

- Organization boundaries:
  - Pass: same user switching active org sees separate agents, numbers, calls, KB, tools, MCP, campaigns, and secrets.
  - Fail: records from org A appear in org B lists.

- RBAC:
  - Pass: `owner`/`admin` can mutate; `member` can read and create outbound calls only; route permission failures return `403`.
  - Fail: member can buy numbers, configure agents, delete calls, create KB, create tools, or connect MCP.

- Billing and quota:
  - Pass: plans from `apps/server/data/plans.ts` expose `free` 15 minutes, `starter` 245, `growth` 600, `scale` 2660; outbound dispatch rejects once current month usage exceeds included minutes.
  - Fail: quota check runs after provider dispatch or ignores current-month call logs.

- Support handoff:
  - Pass: failed provider actions log clear messages containing provider, IDs, and reason without leaking secrets.
  - Fail: logs omit identifiers needed for manual cleanup.

- Auditability:
  - Pass: audit rows are recorded for API key authentication, agent create/update/config, number purchase/update/release, call ingest, and MCP tool execution; metadata is redacted.
  - Fail: audit failure breaks core API response or raw credentials appear in `AuditLog.metadata`.

## Integration And API Test Cases

- Better Auth:
  - Pass: email verification and password reset send via SMTP or ZeptoMail; Google OAuth requires configured client ID/secret; session cookies respect secure URL and optional `COOKIE_DOMAIN`.
  - Blocked: live OAuth cannot be passed without Google credentials.

- Stripe:
  - Pass: Better Auth Stripe plugin can create customers/subscriptions; call ingest reports `billing.meterEvents.create` when `STRIPE_CALL_MINUTES_METER_EVENT_NAME` and org Stripe customer exist; zero-duration calls skip usage.
  - Blocked: live billing checks require Stripe test keys and webhook secret.

- S3:
  - Pass: KB and outbound batch upload URLs are signed PUT URLs; call recordings stored as S3 keys are converted to signed download URLs; HTTP(S) recording URLs are left unchanged.
  - Blocked: live object read/write/delete requires S3-compatible test bucket.

- Twilio/Telnyx:
  - Pass: search, purchase, trunk/connection attach, detach, and release work with sandbox numbers; lower-case provider input normalizes.
  - Blocked: live number lifecycle requires paid carrier credentials.

- LiveKit:
  - Pass: inbound trunk update adds/removes linked numbers; outbound dispatch creates agent dispatch and SIP participant using provider trunk ID.
  - Blocked: real call dispatch requires LiveKit project, SIP trunks, and AI worker.

- AI service/KB:
  - Pass: BullMQ KB worker posts to `${AI_API_URL}/kb/process` with `x-internal-key`; success body must include all expected `kbId`s with `status:"ok"`.
  - Blocked: real indexing requires AI API and vector/storage backend.

- Smithery/MCP:
  - Pass: connect/refresh/execute call Smithery APIs with bearer key; disconnect ignores missing key but deletes local DB connection.
  - Blocked: real OAuth and tool execution require Smithery API key and provider accounts.

- Inngest:
  - Pass: `/api/inngest` exposes `kb-ingest-documents` and `data-retention`; retention cron is `TZ=UTC 0 3 * * *`.
  - Blocked: hosted Inngest invocation requires external Inngest setup.

## Non-Functional Test Cases

- Performance:
  - Pass: list endpoints honor limits (`calls` max 100, transcripts max 100, outbound max 100, number search max 50, MCP page size max 100); dashboard returns within acceptable local latency with seeded data.
  - Fail: unbounded responses or slow queries without indexes.

- Reliability:
  - Pass: DB writes that touch multiple records use transactions; external side effects have rollback or failure logging; workers retry failed jobs.
  - Fail: partial state is silent.

- Resilience:
  - Pass: Redis outage makes `/ready` fail and queue-dependent flows fail clearly; DB outage makes `/ready` fail; S3 missing bucket errors only S3 flows.
  - Fail: server crashes on optional provider env absence before route use.

- Data integrity:
  - Pass: soft-deleted call logs disappear from list/detail/transcript/dashboard; active KB count increments/decrements only on active rows; phone/tool counters self-heal on relink/attach.
  - Fail: counters drift after updates.

- Rate limiting:
  - Pass: more than 100 requests per 15 minutes from one IP returns `429` with rate-limit headers.
  - Fail: rate limit is absent or blocks Better Auth/webhook use unexpectedly.

- Concurrency:
  - Pass: duplicate agent names in same org return one success and one duplicate error; duplicate batch job IDs do not create duplicate imports; repeated attach/detach is idempotent.
  - Fail: duplicate rows or double-dispatch.

## UX, UI, Accessibility, And Compatibility Testing

This module has no custom browser UI, but it powers Swagger UI and console workflows.

- Swagger UI:
  - Pass: `/api/v1/docs` renders without horizontal clipping on desktop and mobile widths, route groups are readable, auth schemes show session cookie and `x-api-key`, and “Try it out” works for authenticated routes.
  - Fail: docs are blank, overlapping, stale, or persist auth when `persistAuthorization:false`.

- Console API UX:
  - Pass: empty lists return `success:true` and `data:[]`; validation errors include `fieldErrors` keyed to fields such as `documents.0.name`; destructive actions return clear messages.
  - Fail: console has to parse generic 500 messages for normal validation.

- Loading/polling states:
  - Pass: KB sources expose `PROCESSING`, `ACTIVE`, `ERROR`; outbound status endpoint exposes compact `status`, `failureReason`, `updatedAt`; batch detail shows counts and row statuses.
  - Fail: clients cannot distinguish pending, failed, and completed work.

- Accessibility compatibility:
  - Pass: API error messages are concise enough for screen reader toast/dialog use; docs navigation is keyboard reachable.
  - Fail: important errors only appear in logs.

## Security, Privacy, And Compliance Checks

- Error handling:
  - Pass: unexpected errors return generic `INTERNAL_SERVER_ERROR`; Zod errors return `VALIDATION_ERROR` and field-addressable details; `x-request-id` or `x-correlation-id` is echoed as `requestId`.
  - Fail: stack traces or secrets leak.

- SSRF protection:
  - Pass: webhook, tool, KB URL, and MCP custom URL flows reject non-HTTPS, localhost, `.local`, private IPv4/IPv6, credentials in URLs, and DNS resolution to private addresses.
  - Fail: `http://localhost`, `https://127.0.0.1`, or metadata IPs are accepted.

- Secret storage:
  - Pass: `SECRET_ENCRYPTION_KEY` or auth/internal secret derives AES-256-GCM key; stored secrets use `qvsec:v1:` envelopes or `qvsecret:` references; read APIs redact values to `null` with `redacted:true`; runtime internal config resolves only same-org secrets.
  - Fail: plaintext secret values stored or returned.

- PII:
  - Pass: `CALL_LOG_PII_REDACTION` defaults on; phone, email, SSN, card-like values are redacted in call metadata, caller ID, transcripts, extracted data, evaluated data, and audit metadata.
  - Fail: raw PII persists by default.

- Internal trust boundary:
  - Pass: internal bearer token is never reused for public API keys; external clients cannot use `Authorization: Bearer` as API-key auth.
  - Fail: internal bypass is exposed to browsers or untrusted vendors.

- Retention:
  - Pass: retention deletes old transcripts, clears old recording paths, deletes old MCP logs, and deletes failed KB rows according to configured day counts.
  - Fail: retention deletes active/current data or ignores configured retention days.

## Edge Cases And Failure Modes

- Missing active organization: protected resource calls return `403` or `400`, not a Prisma error.
- Oversized JSON body: returns `PAYLOAD_TOO_LARGE`.
- Invalid enum casing: providers normalize; call status currently expects Prisma enum casing unless schema preprocesses it.
- Duplicate agent slug: returns `400` in same org; same name in different org is allowed.
- Phone purchase DB failure: provider number is released best-effort; rollback failure logs critical paid orphan.
- Phone link LiveKit/provider failure: successful side effects are reverted best-effort.
- Call ingest with stale outbound ID: call log persists and warning is logged; outbound link is non-fatal.
- S3 recording key missing/unreadable: detail/list should fail clearly only when signing is attempted.
- KB worker permanent failure: rows become `ERROR`.
- Batch file missing `phone_number`: import job fails; campaign should not silently dispatch.
- Outbound SIP failure after dispatch creation: dispatch cleanup is attempted and outbound row becomes `FAILED`.
- MCP Google Drive insufficient scope: connection becomes `AUTH_REQUIRED` with setup URL.
- Audit/Stripe usage failure: core request should still succeed where code uses best-effort `.catch`.

## Test Data, Fixtures, Accounts, And Roles

No static test account credentials are committed.

Create accounts through the console or Better Auth flow, then seed demo data:

```sh
pnpm --filter server seed -- --email you@example.com
pnpm --filter server seed -- --org-slug my-workspace
```

Seed creates or appends:

- Agents: `Sales Qualifier`, `Support Intake`, `Appointment Setter`
- Numbers: `+14155550101` Twilio “Main line”, `+14155550102` Telnyx “Support line”
- Call logs: 160 generated calls across recent/week/month ranges with transcripts for completed calls
- KB sources: `Pricing FAQ`, `Product handbook`, `Refund policy`

Seed pass/fail:

- Pass: target user/org exists, seed completes, dashboard has call history, agents have counters.
- Fail: seed runs against wrong org, duplicates pile up unexpectedly, or no user/org is found.

Recommended role matrix:

- `owner_user`: org owner
- `admin_user`: org admin
- `member_user`: org member
- `outside_user`: user in a different organization
- API key with `{ "*": ["*"] }` or specific route permissions
- API key with missing permissions for negative `403` tests

## External Services Or Blocked Checks

Mark a check blocked instead of guessing when credentials are unavailable.

- Postgres:
  - Pass: `/ready` `db.status` is `ok`.
  - Blocked: Docker/Postgres unavailable.
  - Fail: DB check errors or times out.

- Redis:
  - Pass: `/ready` `redis.status` is `ok`; BullMQ jobs process.
  - Blocked: Docker/Redis unavailable.
  - Fail: queues cannot enqueue or workers cannot connect.

- S3:
  - Pass: presigned upload/download works and delete removes test object.
  - Blocked: no `S3_BUCKET_NAME` and AWS/S3 credentials.
  - Fail: URLs generated for wrong bucket/key/org prefix.

- Twilio/Telnyx:
  - Pass: sandbox search, purchase, attach, detach, release succeed.
  - Blocked: no test carrier account/trunk/connection.
  - Fail: paid resource is orphaned or wrong provider binding is used.

- LiveKit:
  - Pass: SIP trunk update and outbound SIP participant creation work in test project.
  - Blocked: no LiveKit URL/API key/SIP trunks/AI worker.
  - Fail: outbound row remains scheduled after LiveKit failure.

- Stripe:
  - Pass: test subscription/customer and metered event are visible in Stripe test dashboard.
  - Blocked: no Stripe test keys/webhook secret.
  - Fail: usage event duplicates for same `call:{callId}` or quota ignored.

- SMTP/ZeptoMail:
  - Pass: verification/reset email appears in Mailpit or ZeptoMail test logs.
  - Blocked: no SMTP or ZeptoMail credentials.
  - Fail: auth flow crashes without controlled email error.

- Smithery/MCP:
  - Pass: connect, setup, refresh, execute, disconnect work for test MCP server.
  - Blocked: no Smithery API key or OAuth provider test account.
  - Fail: execution succeeds when connection is not `CONNECTED`.

- AI API/KB Ops:
  - Pass: KB processing endpoint returns all expected IDs and statuses.
  - Blocked: no AI API or `KB_OPS_URL`.
  - Fail: KB rows stuck `PROCESSING` after permanent worker failure.

## Regression Risks

- Better Auth handler must stay before `express.json()` or auth client requests can hang.
- `authMiddleware` internal bypass must never be mounted on public browser-origin workflows without trusted token control.
- Route order in outbound calls matters: `/batches` and `/batch-upload-url` must stay before `/:outboundId`.
- Tenant-safe writes use composite `organizationId` predicates; replacing them with primary-key-only updates is high risk.
- Provider side effects before DB updates can create paid orphan resources if rollback/logging changes.
- `CALL_LOG_PII_REDACTION=false` is a privacy-sensitive production risk.
- Prisma schema and Swagger can drift, especially outbound optional fields represented from `optionalData`.
- Retention jobs permanently delete transcripts/MCP logs and clear recording paths.
- Build/Docker startup runs `prisma migrate deploy`; bad migrations can block container boot.
- Queue workers are imported during server startup; Redis connection behavior affects local boot and readiness.

## Release Acceptance Checklist

- `git diff -- apps/server` is empty except intentional changes.
- `pnpm --filter server test` passes.
- `pnpm --filter server lint` and `pnpm --filter server check-types` pass.
- `/api/v1/health` returns `200`.
- `/api/v1/ready` returns expected `200` or documented `503` with clear blocked integrations.
- `/api/v1/docs` and `/api/v1/docs.json` include all mounted module routes.
- Owner/admin/member RBAC matrix passes.
- Cross-organization read/write attempts fail.
- Agent config secrets, tool secrets, audit metadata, and call PII are redacted.
- KB create/list/delete and worker success/failure paths pass or are explicitly blocked.
- Outbound quick and batch flows pass with LiveKit sandbox or are explicitly blocked.
- Phone-number lifecycle passes with carrier sandbox or is explicitly blocked.
- Stripe metered usage and quota checks pass with Stripe test mode or are explicitly blocked.
- Retention function behavior is verified on disposable data.
- No production credentials, paid numbers, real customer transcripts, or real recordings are used in testing.
