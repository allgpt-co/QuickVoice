# QuickVoice Audit Remediation and Hardening Report

**Prepared:** July 27, 2026

**Review branch:** `agent/quickvoice-audit-remediation-review`

**Intended base:** `origin/main`

**Status:** Implementation complete and prepared for pull-request review

## Document Purpose

This report explains the QuickVoice changes prepared after the repository,
security, and UI/UX audits. It is intended to give engineering, security,
product, operations, and legal reviewers a single detailed account of:

- what changed;
- why the change was necessary;
- how runtime behavior is different;
- which risks were reduced;
- which deployment requirements were introduced;
- how the implementation was verified; and
- what reviewers should examine before merge and release.

This is a change report, not a claim that software can be made risk-free. The
historical `audit.md` and `ui_ux_audit.md` files remain point-in-time evidence
of earlier repository states. Their findings should not be read as a current
defect list without checking the implementation and the pull-request diff.

## Executive Summary

The remediation moves QuickVoice from an audit-era implementation with several
implicit trust assumptions into a more explicit, fail-closed operating model.
The work is concentrated in nine areas:

1. **Permissive licensing:** repository licensing and related public copy move
   from AGPL-3.0-only to MIT.
2. **Authentication and secret safety:** internal API credentials use
   timing-safe comparison; integration secrets require a dedicated encryption
   key; redacted secrets survive edits without being erased; secret references
   are scoped and cleaned up.
3. **Tenant and data integrity:** writes and destructive operations validate
   organization ownership, call ingestion is idempotent, Stripe usage events
   are idempotent, and derived counters are recalculated instead of blindly
   incremented.
4. **Resource lifecycle management:** deleting agents, calls, knowledge
   sources, tools, or organizations now cleans up associated provider and
   object-storage resources instead of only deleting database rows.
5. **Retention and privacy controls:** per-agent transcript retention,
   recording deletion, failed-KB cleanup, MCP log cleanup, zero-PII controls,
   and bounded cleanup batches are implemented.
6. **Knowledge-base reliability:** ingestion is consolidated on BullMQ,
   one document is isolated per job, progress and sanitized errors are stored,
   automatic retries are visible, and users can retry eligible failed
   documents.
7. **Billing and outbound safety:** the console receives real billing-period
   usage; upload size, extension, MIME type, object key, tenant namespace, and
   recipient limits are enforced for outbound batches.
8. **Console and API completeness:** agent preview and deletion workflows,
   privacy controls, KB progress/retry, date filtering, billing usage, redacted
   secret editing, and expanded OpenAPI coverage are wired end to end.
9. **Supply-chain and CI hardening:** vulnerable dependency paths are upgraded
   or overridden, the audit gate runs at `low` severity with zero
   suppressions, Python dependencies are audited, and warnings fail the AI
   test job.

The primary operational tradeoff is deliberate: destructive operations can
now fail if external cleanup cannot be completed. This prevents silent orphaned
recordings, vectors, uploads, phone numbers, subscriptions, and secrets, but it
also makes provider availability part of deletion reliability.

## Scope and Boundaries

### Included

The review branch contains the completed remediation across:

- root repository metadata, licensing, scripts, task definitions, CI, and
  dependency policy;
- the Express/TypeScript API server;
- the Python FastAPI and LiveKit AI service;
- the authenticated Next.js console;
- the public Next.js site where licensing or dependency compatibility changed;
- API documentation, test guides, launch copy, positioning, and sales material;
- focused unit, route, service, source-contract, and security tests; and
- this Markdown report and its generated DOCX counterpart.

### Deliberately Excluded

The commit does not include known local-only or separately owned workspace
changes, including:

- `.mcp.json`;
- `.codex/`, `.superpowers/`, and `.tmp/`;
- `scripts/codex_product_video_tutorial.py` and its test;
- `scripts/enrich_segment_decision_makers.py` and its test; and
- the existing untracked `video-tutorials/` directory.

Keeping these files out of the remediation commit prevents unrelated tutorial,
workspace, and prospecting work from being coupled to the security and
reliability review.

## Architecture-Level Change

Before this remediation, several workflows treated the database as the sole
source of lifecycle truth even when the product also created external
resources. For example, deleting a row did not necessarily delete an S3
object, a vectorized knowledge document, a purchased number, or a Stripe
subscription. Other workflows accepted a user-provided reference and relied on
later code to use it safely.

The revised design applies four common rules:

1. **Authenticate and scope first.** Resolve the active organization and prove
   ownership before reading, linking, retrying, updating, or deleting a
   resource.
2. **Validate the reference, not only the payload shape.** Uploaded object keys
   must belong to the active organization's namespace and match a server-issued
   UUID-based format.
3. **Make retries safe.** Call logs, billing events, KB counters, and retry
   claims are designed so repeated delivery does not duplicate state or usage.
4. **Coordinate external cleanup explicitly.** Provider and storage cleanup
   happens before the final destructive database operation, and failures are
   surfaced instead of silently ignored.

These rules are implemented in services and repositories, with dependency
injection at cleanup boundaries so failure behavior can be tested without live
providers.

## Detailed Changes

### 1. License Conversion to MIT

The repository license changes from GNU Affero General Public License v3.0 to
the MIT License.

Changed surfaces include:

- the root `LICENSE`;
- root and workspace `package.json` license metadata;
- `README.md` and `CONTRIBUTING.md`;
- the public `llms.txt`, homepage structured content, FAQ, and footer;
- launch, marketing, positioning, and sales documents; and
- historical audit headers and references where current licensing is
  discussed.

#### Behavioral and legal effect

MIT permits use, copying, modification, merging, publishing, distribution,
sublicensing, and sale, including proprietary and commercial use, subject to
retaining the copyright and permission notice. The previous AGPL network-use
source-disclosure requirement no longer applies to code distributed under this
MIT version.

#### Review requirement

This is not merely copy cleanup. It is a legal policy change and should be
approved by the party that controls the relevant copyrights. Engineering
verification cannot establish relicensing authority.

### 2. Internal Authentication and Readiness

Internal server-to-server bearer credentials are now compared with
`timingSafeEqual` after a length check. An unset `INTERNAL_API_KEY` cannot match
an empty or accidental value.

Agent voice catalog, preview-session, KB processing, and KB vector-cleanup
paths now require an explicit internal key instead of sending an empty fallback.

Readiness now distinguishes:

- required core dependencies: database, Redis, Better Auth secret, internal API
  key, and secret encryption key;
- optional integrations such as S3, Stripe, Twilio, LiveKit, SMTP, and
  Smithery; and
- operator-selected required integrations through
  `READINESS_REQUIRED_INTEGRATIONS`.

Unknown required integration names fail readiness rather than being silently
ignored. Database and Redis failures return stable operator-safe messages
instead of exposing raw connection errors.

#### Operational effect

The API can boot with optional Stripe configuration absent, report Stripe as
`not_configured`, and remain ready unless Stripe is explicitly required. Core
security material remains mandatory. This separates "service cannot operate
safely" from "an optional feature is unavailable."

### 3. Dedicated Secret Encryption and Secret Lifecycle

Integration secret encryption now requires `SECRET_ENCRYPTION_KEY`. The code no
longer silently derives encryption material from `BETTER_AUTH_SECRET` or
`INTERNAL_API_KEY`.

The secret workflow now:

- encrypts values with AES-256-GCM;
- stores scoped secret records and persists references in tool or webhook
  configuration;
- redacts values returned to the console;
- recognizes a submitted redacted placeholder and restores the existing
  reference during an edit;
- verifies that every submitted reference belongs to the active organization;
- deletes newly created secrets if the parent write fails;
- prunes replaced references after a successful update; and
- removes scoped references when an agent or tool is deleted.

#### Risk addressed

Previously, a user editing an unrelated field could overwrite a redacted secret
with a blank value. Stale secret rows could accumulate, and a forged reference
could potentially point at another organization's secret if ownership was not
checked at the service boundary.

#### Migration warning

Deployments with existing `qvsec:v1:` values must preserve the original
encryption material. If an earlier deployment implicitly used
`BETTER_AUTH_SECRET` or `INTERNAL_API_KEY`, set `SECRET_ENCRYPTION_KEY` to that
same material before deploying this code, verify decryption, and then perform a
planned rotation. Setting an unrelated new key immediately will make existing
ciphertext unreadable.

### 4. Agent Creation, Configuration, Preview, and Deletion

Agent names are trimmed and bounded. Server-side slugs are deterministic and
empty names fall back safely; unique-constraint failures are translated into a
clear organization-scoped conflict message.

Configuration now supports:

- `store_call_audio`;
- `zero_pii_retention`; and
- `conversation_retention_days` from 1 through 3,650 days.

The API rejects the contradictory state where zero-PII retention and call-audio
storage are both enabled. The console mirrors this rule, automatically disables
audio storage when zero-PII is selected, and exposes transcript retention as a
writable setting.

Agent preview is available from the agents table through the existing
preview-session API instead of being an inert action. Pagination is clamped
after data changes so deleting the final item on a page cannot leave the table
on an invalid page.

Agent deletion now:

1. loads an organization-scoped deletion context;
2. unlinks assigned phone numbers;
3. deletes each knowledge source's object and vector assets;
4. deletes the knowledge-source rows;
5. removes agent-scoped secret records; and
6. deletes the agent.

The console uses one supported, confirmed delete workflow in both the agents
table and Advanced tab.

#### Tradeoff

Agent deletion is intentionally fail-closed. If number unlinking or KB cleanup
fails, the service reports the error rather than deleting the agent and leaving
unowned external resources.

### 5. Tool and Webhook Secret Editing

Tool headers, dynamic variables, and agent webhook secret fields now carry an
explicit `redacted` state. Nullable values are accepted only for a legitimate
redacted secret placeholder; ordinary values remain required.

The console preserves this marker until a user actually edits the value. The
server then restores the stored secret reference, validates organization
ownership, writes the parent record, and prunes replaced secrets.

Tool creation assigns the tool identifier before secret storage. This makes
secret names uniquely scoped to the final tool instead of using a shared
generic prefix.

Remote tool and webhook URLs continue through the safe-URL policy, reducing
server-side request forgery exposure.

### 6. Idempotent Call Ingestion and Safer Call Deletion

Call-log ingestion now uses `createMany(..., skipDuplicates: true)` within a
transaction, then reads the canonical row. Re-delivery of the same `callId`
returns the existing call without duplicating transcripts or incrementing
derived data.

If the same call identifier already belongs to another organization, ingestion
fails with a bad-request error. Outbound-call linkage uses a composite
`outboundId + organizationId` predicate.

Call-list date validation rejects an end date earlier than the start date. The
console converts calendar dates into local start-of-day and end-of-day ISO
boundaries and resolves relative ranges once per page opening, avoiding a
moving query key during render.

Deleting a call now:

1. loads the active, organization-scoped row;
2. deletes the recording object when it is an internal storage key;
3. atomically marks the row deleted only if the recording path still matches;
4. clears the recording path, caller identity, metadata, extracted data, and
   evaluated data; and
5. deletes transcripts.

The remaining row is a minimal tombstone for referential and operational
consistency rather than a container for retained PII.

### 7. Idempotent Metered Billing and Real Usage Reporting

Stripe call-minute events now use:

- a stable event identifier: `call:<callId>`; and
- a Stripe idempotency key: `quickvoice-call:<callId>`.

This prevents duplicate usage if call-finalization delivery is retried. Duration
is rounded up to whole billable minutes, with zero-duration calls skipped.

A new authenticated `GET /billing/usage` endpoint calculates:

- active plan and subscription status;
- billing period start and end;
- included, used, remaining, and overage minutes;
- raw used seconds;
- percentage used; and
- call count.

The active subscription period is authoritative when available; otherwise the
current UTC calendar month is used. The console billing page replaces the
"coming soon" placeholder with actual usage, a progress indicator, period end,
remaining or overage minutes, and a retryable error state.

### 8. Organization Deletion and External Cleanup

Better Auth's organization deletion hook now runs a dedicated cleanup service
before database deletion.

The cleanup sequence:

1. releases purchased phone numbers through the configured provider;
2. removes knowledge-source objects and vectors;
3. deletes knowledge-source rows;
4. deletes or detaches call recordings;
5. deletes outbound campaign source files;
6. deletes the Stripe customer, or cancels cancellable subscriptions when no
   customer identifier is available; and
7. deletes local subscription rows.

Already-missing Stripe resources are treated as idempotent success. Other
provider failures block organization deletion and return a controlled error.

#### Why cleanup happens first

Once the database organization is deleted, provider identifiers and ownership
context may be difficult or impossible to reconstruct. Cleaning external
resources first preserves enough state to retry safely.

#### Operational consideration

Large organizations may take longer to delete because provider calls are
currently sequential by resource class. Reviewers should consider whether a
future deletion job/state machine is needed for very large tenants. The current
implementation prioritizes correctness and auditability over asynchronous
throughput.

### 9. Retention Enforcement

Retention is no longer a single global transcript delete followed by database
detachment of recordings. The revised service provides:

- per-agent transcript retention from
  `conversation_retention_days`;
- a global transcript fallback for unconfigured or agentless calls;
- object-storage deletion before recording-path detachment;
- bounded, cursor-based recording cleanup;
- MCP execution-log deletion;
- bounded cleanup of failed knowledge sources, including objects and vectors;
- failure counters and warnings for operations that need retry; and
- upper bounds for retention days and cleanup batch size.

Relevant configuration:

| Variable                       | Default | Purpose                       |
| ------------------------------ | ------: | ----------------------------- |
| `TRANSCRIPT_RETENTION_DAYS`    |      90 | Fallback transcript retention |
| `RECORDING_RETENTION_DAYS`     |      30 | Recording-object retention    |
| `MCP_LOG_RETENTION_DAYS`       |      30 | MCP execution-log retention   |
| `FAILED_KB_RETENTION_DAYS`     |      30 | Failed KB source retention    |
| `RETENTION_CLEANUP_BATCH_SIZE` |      25 | Bounded storage cleanup batch |

The maximum accepted retention period is 3,650 days and the maximum cleanup
batch is 250. Invalid configuration falls back to defaults.

### 10. Knowledge-Base Queue Consolidation

The old duplicate Inngest KB ingestion function is removed. BullMQ is now the
single ingestion coordinator, while Inngest remains responsible for data
retention.

Each uploaded or linked document receives:

- its own BullMQ job;
- a stable job identifier;
- queue metadata on the `KnowledgeSource` row; and
- independent retry/failure state.

This isolates a bad document from otherwise valid documents submitted in the
same request.

Queue construction is lazy so importing service modules does not create an
immediate Redis connection. The queue uses exponential backoff, three attempts,
and bounded completed/failed job retention.

### 11. Knowledge-Base Progress, Failure, and Retry

The KB worker now records:

- queued, processing, retrying, completed, or failed stage;
- current attempt and maximum attempts;
- processed/total/percentage progress;
- BullMQ job ID and downstream processor job ID;
- sanitized failure reason;
- retryability; and
- manual retry lineage and retry count.

Processor status is persisted during polling, not only at completion. Raw
downstream response bodies are no longer inserted into thrown HTTP errors.
Failure metadata redacts authorization values, API keys, tokens, secrets,
passwords, credentials, bearer tokens, sensitive query parameters, and other
PII patterns. Failure text is normalized and bounded.

Automatic retry state remains `PROCESSING` and visible as `retrying`. A source
becomes `ERROR` only when all automatic attempts are exhausted or the processor
classifies the failure as unrecoverable.

A new `POST /kb/:kbId/retry` endpoint:

- requires organization ownership;
- permits only `ERROR` rows;
- rejects explicitly unretryable failures;
- atomically claims the row so two retry requests cannot enqueue duplicate
  jobs;
- revalidates URL or storage-key safety; and
- restores `ERROR` with a controlled reason if queue submission fails.

The console displays stage, percentage, shortened job identifier, sanitized
failure reason, and an eligible Retry action.

### 12. Knowledge-Base Upload Policy

The upload URL endpoint now requires file name, content type, and file size.
Server policy validates extension and MIME type together.

Supported file types:

| Extension | Source type | Representative MIME type   |
| --------- | ----------- | -------------------------- |
| `.pdf`    | PDF         | `application/pdf`          |
| `.txt`    | TXT         | `text/plain`               |
| `.csv`    | CSV         | `text/csv`                 |
| `.docx`   | DOCX        | WordprocessingML           |
| `.xlsx`   | XLSX        | SpreadsheetML              |
| `.xls`    | XLS         | `application/vnd.ms-excel` |

The server issues an opaque key in the form:

`kb/<organizationId>/<uuid>.<approved-extension>`

When the create request references an uploaded file, the key must match the
active organization and the declared source type. This prevents a client from
submitting another tenant's S3 key or relabeling an object.

The default limit is 10 MB, configurable with `KB_MAX_UPLOAD_BYTES` up to 100
MB. Presigned upload requests include the expected content length and normalized
content type. The console applies the same default limit for immediate
feedback, while the server remains authoritative.

Deletion no longer swallows object or vector cleanup errors. A row is removed
only after its external assets are handled.

### 13. Outbound Batch Upload and Import Safety

Outbound batch upload now accepts only CSV and XLSX. It validates:

- file name length;
- extension and MIME compatibility;
- positive file size;
- default 5 MB upload limit;
- server-generated object key format;
- organization namespace;
- file-name and key extension agreement; and
- default 10,000-recipient import limit.

Relevant configuration:

| Variable                          | Default | Maximum accepted |
| --------------------------------- | ------: | ---------------: |
| `OUTBOUND_BATCH_MAX_UPLOAD_BYTES` |    5 MB |            50 MB |
| `OUTBOUND_BATCH_MAX_RECIPIENTS`   |  10,000 |          100,000 |

Invalid parse or recipient-limit failures mark the campaign `FAILED` instead of
leaving it indefinitely scheduled. The console uses the content type returned
by the server and rejects oversized files before requesting an upload URL.

### 14. API Documentation

The OpenAPI specification is expanded to describe the actual changed contract,
including:

- writable privacy and retention controls;
- agent deletion semantics;
- KB upload response fields and file types;
- KB job metadata and retry;
- outbound batch upload and campaign operations;
- call filter validation;
- billing usage;
- failure reason fields;
- tool secret placeholder behavior; and
- readiness semantics.

The specification distinguishes user session/API-key security from internal
endpoints and adds focused tests to ensure required paths remain present.

### 15. AI Worker and Runtime Dependencies

The LiveKit agent dependency is updated from the older 1.2 line to the 1.6
line. Turn detection moves from the removed multilingual plugin model to
LiveKit inference `TurnDetector`, with preemptive generation configured in the
turn-handling options.

The recording worker no longer supplies a hard-coded fallback S3 bucket.
Recording storage fails clearly when a bucket is not configured, preventing
production audio from being written to an unintended legacy bucket.

Runtime requirements and test/audit requirements are split:

- `requirements.txt` contains runtime dependencies;
- `requirements-dev.txt` adds the runtime set, `pytest`, and `pip-audit`;
- CI installs the development requirements;
- AI tests run with warnings treated as errors; and
- Docker's optional CPU Torch preinstall is bounded to a supported major
  version.

### 16. Console Reliability and Usability

In addition to the KB, billing, agent, and retention controls described above,
the console change set includes:

- corrected local console and landing-site ports;
- stable relative-range and calendar-date call filters;
- clamped pagination after deletion or filtering;
- mobile and desktop agent actions that expose preview and confirmed deletion;
- secret editors that distinguish an unchanged redacted secret from an empty
  replacement;
- stricter webhook URL behavior;
- dynamic voice catalog fallback wording and compatibility cleanup; and
- stronger source-contract tests for previously audited failure, retry,
  accessibility, and workflow states.

The obsolete `AgentCard` component is removed after the agent list is
consolidated into responsive table/mobile views.

### 17. Public Site and Marketing Consistency

Public-facing license language now consistently says MIT rather than AGPL. The
footer identifies QuickVoice contributors and the MIT license, and structured
FAQ content matches visible FAQ content.

Targeted pricing and HIPAA copy no longer implies that choosing a repository or
plan is enough to establish compliance. The associated source-contract test
checks for the safer deployment-outcome language and rejects the stale
15-minute homepage and FAQ claims.

The particle component is adapted to the upgraded `@tsparticles` v4 provider
API. Development-only successful image-load logging is removed from two landing
sections to avoid noisy browser output.

Launch, positioning, marketing, and sales copy is updated so it does not
promise AGPL obligations or commercial-license terms that no longer match the
repository.

The launch-scoped claims audit passes for the open-source launch surface.
However, the repository-wide claims inventory still blocks on 632 potential
unsupported claims across 407 files: 280 certification or regulatory claims,
105 absolute-outcome claims, 74 integration claims, 59 deployment-speed claims,
48 QuickVoice metric claims, 43 language-count claims, and 23 adoption claims.
These are primarily in the broader industry, solution, component, and blog
catalog inherited from the current base. They require evidence registration or
copy changes in a dedicated marketing-compliance pass and must not be
represented as resolved by this remediation.

### 18. Dependency and Supply-Chain Remediation

The Node dependency graph is refreshed and constrained, including updates to
Next.js, Better Auth, Stripe, Morgan, Fast XML Parser, TypeScript ESLint,
Turborepo, tsx, tsParticles, and transitive vulnerable packages.

The root Node engine is raised to:

`^20.19 || ^22.13 || >=24`

This matches current dependency runtime requirements and prevents unsupported
Node versions from being treated as valid.

The same range is now used by the root manifest, developer doctor, setup
documentation, contribution guidance, console requirements, release
documentation, and orchestration tests. The doctor intentionally rejects Node
21 and 23 as unsupported odd-numbered lines instead of accepting every major
version above 20.

The security gate now:

- defaults to `low` severity;
- rejects invalid or unknown CLI arguments;
- treats an audit execution error as a gate failure;
- validates suppression-file structure;
- distinguishes advisories below the chosen threshold;
- runs production and complete dependency contexts; and
- operates with an empty suppression list.

#### Minimatch compatibility patch

The dependency graph overrides vulnerable older minimatch lines to 10.2.5. A
small pnpm patch preserves the callable CommonJS export expected by consumers
written for minimatch 3 and 9 while retaining modern named exports.

This patch is intentionally narrow but deserves reviewer attention because it
bridges a major-version API boundary. It should be removed when the remaining
consumers natively support a non-vulnerable version without compatibility
adaptation.

### 19. CI and Developer Workflow

CI now:

- caches both Python runtime and development requirement files;
- installs one reproducible Python development requirement set;
- runs `pip-audit`;
- treats Python warnings as errors;
- runs the Node dependency gate at `low` severity; and
- keeps the frozen-lockfile install requirement.

`Taskfile.yml` and `scripts/ci-python.sh` align local Python setup with CI.
README, contribution guidance, and testing guides document the stronger audit
threshold and updated commands.

The docs prebuild refreshes the generated MCP reference so the KB update
operation is listed as the 36th tool. This keeps the committed reference aligned
with the route inventory used by the documentation build.

Historical audit files are labeled as snapshots so readers do not mistake old
findings for live scan output.

## API Contract Summary

### New endpoint

`GET /api/v1/billing/usage`

Requires authenticated call-log read permission and returns current period
usage for the active organization.

### New endpoint

`POST /api/v1/kb/:kbId/retry`

Requires knowledge-source create permission and returns `202 Accepted` after
successfully claiming and queuing an eligible failed source.

### Changed upload query

Both KB and outbound batch upload URL requests now require `fileSize`.
Responses include normalized `contentType` and the applicable
`maxUploadBytes`; KB responses also include the server-derived `sourceType`.

### Changed agent configuration

Agent configuration accepts:

- `store_call_audio`;
- `zero_pii_retention`; and
- `conversation_retention_days`.

Older API clients remain compatible because these fields are optional at input
and server defaults remain available.

### Changed deletion semantics

Agent, call, knowledge-source, and organization deletion may now fail when
required external cleanup fails. Clients should display the returned error and
permit retry rather than assuming all delete requests are database-only.

## Data and Schema Impact

No database migration is required by this change set. The Prisma schema edits
clarify existing fields and relationships; the new behavior uses existing
metadata, status, secret, subscription, and storage-path columns.

The implementation changes how existing fields are interpreted:

- `KnowledgeSource.metadata` becomes the KB job state envelope;
- soft-deleted call logs are stripped to minimal tombstones;
- agent configuration privacy fields become actively writable;
- `knowledgeSourcesCount` is synchronized from active rows; and
- campaign status is set to `FAILED` for import failures.

Because the metadata format is additive JSON, existing rows without the new
fields continue to render with fallback behavior.

## Configuration and Deployment Requirements

### Required before rollout

1. Set `SECRET_ENCRYPTION_KEY` to a dedicated 32-byte value, or to the exact
   legacy encryption material first when existing ciphertext must remain
   readable.
2. Confirm a non-empty, high-entropy `INTERNAL_API_KEY` is shared by the server
   and AI service.
3. Confirm Redis is available to both API queue producers and KB workers.
4. Confirm the configured S3 bucket and credentials are correct. There is no
   recording-bucket fallback.
5. Upgrade the deployment runtime to a supported Node version.
6. Install with the committed pnpm lockfile and patched dependency.

### Optional policy configuration

Set `READINESS_REQUIRED_INTEGRATIONS` for integrations that must block traffic
in a particular environment. For example:

`livekit,s3,stripe,twilio`

Set retention and upload variables only when defaults do not match policy.
Invalid or excessively large values fall back to bounded defaults.

### Recommended pre-production checks

- decrypt and update one existing tool secret;
- decrypt and update one existing webhook secret;
- run a KB upload through automatic success;
- force a retryable KB failure and verify automatic retry metadata;
- manually retry an eligible failed KB source;
- delete a test agent with a linked number and KB file;
- delete a test call with a stored recording;
- compare billing usage with raw call duration for one known period;
- upload an oversized or cross-tenant KB/outbound key and confirm rejection;
- exercise organization deletion in a disposable provider account; and
- inspect readiness with optional integrations both configured and absent.

## Verification Evidence

The completed implementation was verified with the following results:

| Verification                            | Result                                       |
| --------------------------------------- | -------------------------------------------- |
| Server tests                            | 148 passed                                   |
| Console source-contract tests           | 65 passed                                    |
| Web tests                               | 13 passed                                    |
| Root Node tests                         | 31 passed                                    |
| AI Python tests with warnings as errors | 137 passed                                   |
| Root tracked Python tests               | 62 passed                                    |
| Application and root test total         | 456 passed                                   |
| Shared ESLint/TypeScript config checks  | 18 passed                                    |
| Turbo task graph validation             | Passed                                       |
| Console, web, and docs type checks      | Passed                                       |
| Console, web, and docs lint             | Passed                                       |
| Server type check and build             | Passed after local generated-type alignment  |
| Docs MCP reference generation           | Passed; 36 tools, 26 resources, 9 exclusions |
| Frozen pnpm lockfile install            | Passed                                       |
| Node dependency audit at low severity   | 0 advisories, 0 suppressions                 |
| Python dependency audit                 | No known vulnerabilities                     |
| Open-source launch claims audit         | Passed; 3 files scanned                      |
| Repository-wide public claims audit     | Blocked; 632 findings across 407 files       |
| Git whitespace/error check              | Passed                                       |

### Environment-limited checks

The console, public-site, and docs Next.js production builds could not complete
in the current host because the Node/V8 runtime failed a native permission
allocation with `errno 12`. Running Node with `--jitless` avoids that native
allocation but disables WebAssembly, which Next.js requires.

Prisma client generation is blocked by the same executable-memory restriction:
normal Node fails during V8 startup, while `--jitless` disables the WebAssembly
engine used by Prisma. The locally installed, ignored generated client predates
the current schema and does not expose the existing `KnowledgeSource`
diagnostic fields. To isolate generated-artifact drift from source errors, the
ignored declaration was temporarily aligned with the schema; server type
checking and compilation then passed, and the temporary change was removed.
GitHub CI regenerates the client before validation and remains the authoritative
check.

These failures were not TypeScript, lint, unit-test, dependency-audit, or
application-code failures. They remain checks that should run in GitHub Actions
or another normal build host before merge.

No live telephony purchase, provider call, Stripe mutation, production S3
deletion, or production organization deletion was executed. Those operations
require controlled credentials and disposable test resources.

## Risk Assessment

### High-review areas

1. **Relicensing:** confirm copyright authority and business intent.
2. **Encryption migration:** confirm existing ciphertext can be decrypted with
   the configured `SECRET_ENCRYPTION_KEY`.
3. **External cleanup ordering:** validate provider failure and retry behavior
   for agent and organization deletion.
4. **Dependency override and minimatch patch:** verify all build and test tools
   under CI's Node version.
5. **KB job state:** validate BullMQ failure-event attempt semantics against the
   deployed Redis/BullMQ version.

### Moderate-review areas

- Stripe meter-event idempotency and billing-period selection;
- call-log duplicate delivery and tombstone behavior;
- per-agent retention policy interpretation;
- upload content-length behavior with the deployed S3-compatible provider;
- outbound campaign failure state and retry expectations; and
- OpenAPI compatibility for external clients that call upload URL endpoints.

### Lower-risk changes

- license-copy consistency;
- local port correction;
- removal of successful image-load logging;
- package metadata alignment;
- audit-document snapshot labels; and
- formatting-only portions of generated OpenAPI and UI files.

## Rollback Considerations

A code rollback is straightforward for most application logic, but data and
external side effects are not automatically reversible:

- deleted S3 objects, vectors, phone numbers, recordings, and Stripe customers
  cannot be restored by reverting Git;
- call tombstone PII removal is intentionally irreversible;
- secret rows pruned after successful replacement are not recreated by a code
  rollback;
- usage events already accepted by Stripe remain recorded; and
- licensing statements already published or distributed may have legal effect
  beyond a repository revert.

For this reason, rollout should start in a staging environment with disposable
provider resources. Production release should include backups, provider audit
logs, and a tested method to disable destructive UI actions if an unexpected
cleanup issue is discovered.

## Suggested Reviewer Order

1. Review `LICENSE`, package metadata, and public/legal copy.
2. Review `apps/server/src/lib/secrets.ts` and
   `secret-store.service.ts`, including migration assumptions.
3. Review tenant-scoped repositories and destructive services for agents,
   calls, KB, tools, retention, and organizations.
4. Review KB queue, metadata, retry, upload, and worker behavior.
5. Review billing usage and Stripe meter-event idempotency.
6. Review console API contracts and user workflows.
7. Review dependency overrides, the minimatch patch, lockfile, and CI.
8. Review OpenAPI and tests, then run the complete CI matrix.

## Representative File Map

| Area                 | Representative files                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| License and policy   | `LICENSE`, `README.md`, `CONTRIBUTING.md`, workspace manifests                                                                      |
| CI and audits        | `.github/workflows/ci.yml`, `.github/workflows/security-audit.yml`, `scripts/security-audit.mjs`, `scripts/ci-python.sh`            |
| Internal auth        | `apps/server/src/middleware/auth.middleware.ts`, `apps/server/src/modules/system/readiness.service.ts`                              |
| Secrets              | `apps/server/src/lib/secrets.ts`, `apps/server/src/modules/secrets/secret-store.service.ts`                                         |
| Agents               | `apps/server/src/modules/agent/*`, `apps/console/src/components/agents/*`                                                           |
| Calls and retention  | `apps/server/src/modules/calllogs/*`, `apps/server/src/modules/retention/retention.service.ts`                                      |
| Billing              | `apps/server/src/modules/billing/*`, `apps/console/src/app/(app)/settings/billing/page.tsx`                                         |
| Knowledge base       | `apps/server/src/modules/kb/*`, `apps/server/src/queues/kb.queue.ts`, `apps/server/src/workers/kb.worker.ts`, console KB components |
| Outbound             | `apps/server/src/modules/outbound/*`, `apps/console/src/components/outbound/BatchCallForm.tsx`                                      |
| Organization cleanup | `apps/server/src/modules/organization/organization-cleanup.service.ts`, `apps/server/src/lib/auth.ts`                               |
| AI runtime           | `apps/ai/main.py`, `apps/ai/handlers/livekit_handler.py`, Python requirement files                                                  |
| API contract         | `apps/server/src/config/swagger.ts` and system Swagger tests                                                                        |
| Dependency policy    | `package.json`, `pnpm-lock.yaml`, `patches/minimatch@10.2.5.patch`                                                                  |

## Merge Checklist

- [ ] Legal/product owner approves MIT relicensing.
- [ ] Existing encrypted secrets are tested with the production migration key.
- [ ] Required environment variables are present in staging.
- [ ] GitHub CI completes console and web production builds.
- [ ] GitHub CI completes the docs production build.
- [ ] GitHub CI completes Prisma validation.
- [ ] Full Node and Python audits remain clean.
- [ ] Repository-wide public claims are rewritten or linked to approved
      evidence before affected pages are promoted.
- [ ] KB success, automatic retry, manual retry, and terminal failure are tested.
- [ ] Cross-tenant upload keys and secret references are rejected.
- [ ] Agent, call, KB, and organization deletion are exercised with disposable
      external resources.
- [ ] Billing usage is reconciled against a known call period.
- [ ] Readiness policy matches each deployment environment.
- [ ] Dependency compatibility patch is reviewed and documented for future
      removal.

## Conclusion

This remediation is a coordinated reliability and security change rather than
a collection of isolated fixes. Its central outcome is that QuickVoice now
treats tenant identity, secret ownership, retry semantics, external resources,
and retention policy as first-class parts of each workflow.

The implementation has broad automated coverage and clean dependency audits.
The remaining release work is operational and governance-focused: complete
production builds and Prisma generation in a normal CI host, resolve or approve
the broader public-claims inventory, validate encryption continuity, exercise
provider cleanup with disposable resources, and obtain explicit approval for
the MIT license change.
