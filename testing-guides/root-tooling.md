# Root tooling, CI, and developer experience Testing Guide

## Intern Testing Orientation

Test this module from a clean checkout of commit `3489a213063743d1c3a5a0465c327150d847097a`.

Start with:

```sh
git rev-parse HEAD
git status --short
```

Pass if `git rev-parse HEAD` prints `3489a213063743d1c3a5a0465c327150d847097a`. Pass if `git status --short` is empty before setup. Fail if tracked files under `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `Taskfile.yml`, `docker-compose.dev.yml`, `.github`, `scripts`, or `.env.dev.example` are already modified unless the test owner explicitly provided that dirty state.

This module is mostly operator-facing. The “UI” is command output, setup ergonomics, GitHub templates, workflow summaries, local service URLs, and failure messages. Do not run `pnpm format` as a validation command because it rewrites files. Treat `task env:dev`, `task deps:*`, `task docker:*`, `task db:*`, `task up:dev`, and `pnpm ci:local` as setup or full verification commands that may create ignored local files, Docker containers, volumes, build output, virtualenvs, or caches.

## Module Overview

Scope files:

- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `Taskfile.yml`, `docker-compose.dev.yml`, `.env.dev.example`
- `.github/ISSUE_TEMPLATE.md`, `.github/pull_request_template.md`, `.github/dependabot.yml`
- `.github/workflows/ci.yml`, `.github/workflows/backend-build.yml`, `.github/workflows/security-audit.yml`
- `scripts/*.sh`, `scripts/*.mjs`, and `scripts/*.py`

The root package uses `pnpm@9.0.0`, Node `>=18`, Turborepo, and go-task. `pnpm-workspace.yaml` includes `apps/*` and `packages/*`. The root scripts include `build`, `dev`, `dev:turbo`, `lint`, `check-types`, `test`, `check:tasks`, `check:configs`, `ci:python`, `ci:docker`, `ci:local`, and `audit:deps`.

Local orchestration is centered on `Taskfile.yml`. The one-command path is `pnpm dev` -> `task up:dev` -> clear stale dev processes, run doctor, create env files, install Node and Python deps, start Docker Postgres/Redis, run Prisma migrations, then start server, console, web, and optional AI services.

CI has three workflow surfaces:

- `.github/workflows/ci.yml`: PR, push to `main`, and `workflow_call`; installs Node, pnpm, Python, Docker Buildx, then runs `pnpm ci:local`.
- `.github/workflows/security-audit.yml`: PR, push to `main`, and Mondays at `03:00 UTC`; runs `pnpm audit:deps -- --audit-level low`.
- `.github/workflows/backend-build.yml`: push to `main` for backend-related paths and manual dispatch; calls CI, builds server/AI images, pushes immutable SHA-tagged images to ECR, runs Trivy, signs with cosign, deploys to ECS, waits for service stability, and writes rollback metadata.

## Architecture And Data Flow Testing

Validate workspace orchestration:

```sh
node scripts/verify-turbo-tasks.mjs
```

Pass if it prints `All expected package scripts are present.` Fail if any expected script is missing from `apps/server/package.json`, `apps/console/package.json`, or `apps/web/package.json`.

Validate Turborepo contract in `turbo.json`. Pass if `build` depends on `^build`, includes `.env*` in inputs, outputs `.next/**`, `!.next/cache/**`, and `dist/**`, and `dev` is `cache: false` plus `persistent: true`. Fail if local app builds can bypass shared package builds or if build outputs are no longer tracked for cache correctness.

Validate env flow. `scripts/dev-env.sh` must copy these only when missing:

- `.env.dev.example` -> `.env.dev`
- `apps/server/.env.dev.example` -> `apps/server/.env.dev`
- `apps/ai/.env.dev.example` -> `apps/ai/.env.dev`
- `apps/console/.env.dev.example` -> `apps/console/.env.local`
- `apps/web/.env.dev.example` -> `apps/web/.env.local`

Pass if existing local env files are kept, not overwritten. Fail if the script partially creates files after detecting a missing template; it should preflight all sources first and abort.

Validate local service data flow. `docker-compose.dev.yml` must expose Postgres `postgres:16` on `127.0.0.1:${POSTGRES_PORT:-5432}:5432`, Redis `redis:7` on `127.0.0.1:${REDIS_PORT:-6379}:6379`, and Mailpit `axllent/mailpit:v1.23` only under profile `mail` on `127.0.0.1:1025` and `127.0.0.1:8025`. Pass if both Postgres and Redis have healthchecks and named volumes. Fail if database or Redis ports bind to `0.0.0.0`.

Validate backend deployment flow in `.github/workflows/backend-build.yml`. Pass if deploy waits for `quality-gate`, validates `AWS_ROLE_ARN`, `AWS_REGION`, `ECR_REPOSITORY`, `AI_ECR_REPOSITORY`, `ECS_CLUSTER`, and `ECS_SERVICE`, uses image digests, scans HIGH/CRITICAL vulnerabilities, signs images, updates only configured ECS containers, waits for `services-stable`, and writes rollback metadata. Fail if `:latest` tags, mutable image references, missing scans, or missing rollback metadata appear.

## Setup And Required Services

Required local tools:

- Node.js `>=18`; CI uses Node `20`.
- `corepack` to activate `pnpm@9.0.0`.
- `pnpm@9.0.0`.
- Python 3; CI uses Python `3.12`.
- Docker CLI plus Docker Compose v2.
- go-task binary named `task`. If missing, install with `go install github.com/go-task/task/v3/cmd/task@latest` or an OS package.
- Optional Go only if installing `task` through `go install`.

Root `.env.dev.example` defines:

```sh
COMPOSE_PROJECT_NAME=quickvoice-dev
SERVER_PORT=5000
CONSOLE_PORT=3000
WEB_PORT=3001
POSTGRES_PORT=5432
REDIS_PORT=6379
AI_API_ENABLED=true
AI_API_PORT=5555
AI_WORKER_ENABLED=false
POSTGRES_USER=quickvoice
POSTGRES_PASSWORD=quickvoice
POSTGRES_DB=quickvoice
REDIS_URL=redis://localhost:6379
```

Service URLs expected from `scripts/dev-up.sh`:

- Console: `http://localhost:3000`
- Marketing web: `http://localhost:3001`
- API health: `http://localhost:5000/api/v1/health`
- API docs: `http://localhost:5000/api/v1/docs`
- AI health when enabled: `http://localhost:5555/health`

Pass setup if `task doctor` exits `0`, required env templates are present and non-empty, Docker daemon is reachable, Compose config is valid, and no required port conflict causes a service startup failure. Warnings about ports already accepting connections are acceptable only when the tester intentionally has compatible services already running. Fail if any `[fail]` line appears.

## Automated Test Commands

Read-only static checks:

```sh
bash -n scripts/ci-docker-build.sh scripts/dev-clear-processes.sh scripts/dev-doctor.sh scripts/dev-env.sh scripts/dev-node-deps.sh scripts/dev-up.sh
node --check scripts/security-audit.mjs
node --check scripts/verify-turbo-tasks.mjs
python3 - <<'PY'
from pathlib import Path
import ast
for path in sorted(Path("scripts").glob("*.py")):
    ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    print(f"ok {path}")
PY
```

Pass if shell and Node checks produce no errors and Python prints `ok` for each `scripts/*.py`. Fail on any syntax error. Do not use `python -m py_compile` for this module guide because it can create `__pycache__`.

Root test subset:

```sh
node --test tests/dev-orchestration.test.mjs tests/root-tooling-ci.test.mjs tests/ecs-deploy-workflows.test.mjs tests/security-audit-suppressions.test.mjs
```

Pass if all 24 tests pass. Fail if any test fails, especially tests covering Taskfile tasks, Docker Compose localhost binding, CI gates, deploy signing/scanning, and audit suppression expiry.

Compose config checks:

```sh
docker compose -f docker-compose.dev.yml --env-file .env.dev.example config
docker compose -f docker-compose.dev.yml --env-file .env.dev.example --profile mail config
```

Pass if the first output includes `postgres` and `redis`, and the second also includes `mailpit`. Fail if config parsing fails or host bindings are not localhost.

Security suppression check:

```sh
node scripts/security-audit.mjs --check-suppressions-only
```

Pass on June 30, 2026 if it reports `43 active, 0 expired, 43 expiring within 30 days`. Fail if any suppression is invalid or expired. All current suppressions expire on `2026-07-19`, so release owners must review them before that date.

Full local CI, after dependencies and services are available:

```sh
pnpm ci:local
```

Pass if `pnpm check:tasks`, `pnpm check:configs`, `pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm test`, `pnpm ci:python`, and `pnpm ci:docker` all exit `0`. Fail on the first non-zero command. Block if pnpm, Python dependencies, Docker Buildx, or network access for dependencies/images is unavailable.

## Functional Test Cases

1. Task discovery.
   Run `task --list`.
   Pass if tasks include `doctor`, `env:dev`, `deps:node`, `deps:python`, `deps`, `docker:up`, `docker:down`, `docker:reset`, `mail:up`, `mail:down`, `dev:clear`, `db:migrate`, `db:seed`, `ci`, `up:dev`, `up`, `dev`, `server:dev`, `console:dev`, `web:dev`, `ai:api`, and `ai:worker`.
   Fail if `task` is missing or any listed task is absent.

2. Env bootstrap non-destructive behavior.
   In a disposable checkout, run `task env:dev` twice.
   Pass if the first run creates the five local env files and the second run prints `kept` for existing files without changing local custom values.
   Fail if existing `.env.dev`, `apps/server/.env.dev`, `apps/ai/.env.dev`, `apps/console/.env.local`, or `apps/web/.env.local` is overwritten.

3. Frozen Node dependency install.
   Run `task deps:node`.
   Pass if `corepack prepare pnpm@9.0.0 --activate` runs and `pnpm install --frozen-lockfile` completes without modifying `pnpm-lock.yaml`.
   Fail if the lockfile changes or pnpm uses a different major version.
   Block if `corepack` or registry access is unavailable.

4. Python dependency install.
   Run `task deps:python`.
   Pass if `apps/ai/.venv` is created and `pip install -r requirements.txt` completes.
   Fail if the virtualenv is created outside `apps/ai` or dependencies install into the system Python.
   Block if Python headers or network access are unavailable.

5. Docker service lifecycle.
   Run `task docker:up`, then `docker compose -f docker-compose.dev.yml --env-file .env.dev ps`, then `task docker:down`.
   Pass if Postgres and Redis become healthy and stop cleanly.
   Fail if services bind publicly, fail healthchecks, or leave unhealthy containers.
   For `task docker:reset`, pass only if the prompt appears before deleting volumes. Fail if volumes are deleted without confirmation.

6. Optional Mailpit.
   Run `task mail:up`, open `http://localhost:8025`, then run `task mail:down`.
   Pass if Mailpit UI loads locally and the service is removed by `mail:down`.
   Fail if SMTP port `1025` or UI port `8025` binds externally or remains running after teardown.

7. Migrations and seed.
   Run `task db:migrate` after Docker is healthy.
   Pass if Prisma migrations apply to `postgresql://quickvoice:quickvoice@localhost:5432/quickvoice`.
   For seed, first create or identify an existing user and organization, then run `task db:seed -- --email tester@example.com` or `task db:seed -- --org-slug my-workspace`.
   Pass if seed creates or updates demo agents, two phone numbers, 160 call logs, transcripts for completed calls, and three knowledge sources under the target organization.
   Fail if seed runs without an existing user/org, writes data to the wrong organization, or deletes existing rows unexpectedly.

8. Full dev startup.
   Run `task up:dev`.
   Pass if console, web, API health, API docs, and AI health URLs are printed and readiness checks report reachable services within 90 seconds.
   Fail if any enabled service exits and `scripts/dev-up.sh` does not stop the remaining child processes.

9. Process cleanup.
   Start QuickVoice dev services, then run `task dev:clear`.
   Pass if only QuickVoice `pnpm dev`, Next dev, server `tsx watch`, and AI `main.py` processes under this repo are stopped.
   Fail if unrelated Node/Python processes outside this repo are killed.

10. Codex runner dry runs.
   Run:
   ```sh
   python3 scripts/codex_module_audit.py --dry-run --module root-tooling
   python3 scripts/codex_module_testing_guide.py --dry-run --module root-tooling
   python3 scripts/codex_ui_ux_audit.py --dry-run --module root-tooling
   python3 scripts/codex_audit_fix.py --dry-run --module root-tooling --skip-deps
   python3 scripts/codex_ui_ux_fix.py --dry-run --module root-tooling --skip-deps
   python3 scripts/codex_viral_launch.py --dry-run --pass time-to-wow --skip-pull
   ```
   Pass if each prints selected scope, log/report paths, and `codex exec` commands without changing tracked files.
   Fail if dry-run mode creates reports, edits tracked files, or starts Codex.

## SaaS Business And Operations Test Cases

Authentication and onboarding setup: verify `apps/server/.env.dev.example` includes `BETTER_AUTH_URL=http://localhost:5000`, `BETTER_AUTH_SECRET=dev-better-auth-secret-change-me-32chars`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`. Pass if examples are placeholders and local URLs match root ports. Fail if live OAuth secrets or production Better Auth secrets are committed. Block real OAuth login until Google OAuth credentials are supplied.

Organizations and RBAC setup: verify migrations create `Organization`, `OrganizationRole`, `Member`, and `Invitation` models, and seed attaches data to one existing organization. Pass if seeded data is organization-scoped. Fail if seed creates cross-tenant data or ignores `--email` / `--org-slug`.

Billing setup: verify server env template uses `STRIPE_SECRET_KEY=sk_test_dev_placeholder` and `STRIPE_WEBHOOK_SECRET=whsec_dev_placeholder`. Pass for placeholder-only local setup. Fail if live Stripe keys are committed. Block checkout, subscription lifecycle, refunds, and webhook verification until Stripe test credentials and webhook forwarding are available.

Customer data boundaries: pass if local Postgres and Redis bind to `127.0.0.1` and `.gitignore` excludes `.env*`, `.venv`, `.next`, `dist`, build output, audit run dirs, and guide run dirs. Fail if local databases bind publicly or generated env files become tracked.

Support handoff: pass if `.github/ISSUE_TEMPLATE.md` asks for impact, command/route, OS/Node/pnpm/Docker/Python versions, provider credentials involved, expected/actual behavior, and security disclosure guidance. Fail if public issues ask users to paste secrets or vulnerability details.

Operational monitoring: pass if CI, dependency audit, backend change detection, deploy config, ECS deployment, and rollback metadata write to `GITHUB_STEP_SUMMARY`. Fail if workflows lose summary output that maintainers need during incident triage.

Retention and lifecycle: pass if `task docker:reset` explicitly prompts before deleting local Postgres/Redis volumes. Fail if destructive local reset is silent. Production retention is blocked in this module because no production retention policy is defined in root tooling.

## Integration And API Test Cases

Local server health:

```sh
curl -fsS http://localhost:5000/api/v1/health
```

Pass if JSON includes `{"success":true,"message":"Server running fine"}`. Fail on non-2xx, invalid JSON, or wrong API version.

Server readiness:

```sh
curl -i http://localhost:5000/api/v1/ready
```

Pass after Docker and migrations if status is `200` and body reports ready. Pass for dependency-failure testing if status is `503` with a structured “Server not ready” response. Fail on `500`, hanging requests, or unstructured errors.

API docs:

```sh
curl -I http://localhost:5000/api/v1/docs
```

Pass if the docs route responds with HTTP success or redirect to docs assets. Fail if dev-up prints docs URL but the route is unavailable.

AI health:

```sh
curl -fsS http://localhost:5555/health
```

Pass when `AI_API_ENABLED=true` if JSON includes `{"ok":true,"service":"ai"}`. Fail if health requires auth or does not start on `AI_API_PORT`.

AI internal auth:

```sh
curl -i http://localhost:5555/agents/test-agent/config
curl -i -H "x-internal-key: dev-internal-key-change-me" http://localhost:5555/agents/test-agent/config
```

Pass if the first request is rejected with `401` or `503`, and the second passes auth but may return downstream config errors depending on seeded data. Fail if internal routes are accessible without `x-internal-key` or `Authorization: Bearer $INTERNAL_API_KEY`.

Docker image validation:

```sh
scripts/ci-docker-build.sh
```

Pass if it builds `quickvoice-server:ci` using `apps/server/Dockerfile --target build` and `quickvoice-ai:ci` with `PREINSTALL_CPU_TORCH=true` and `SKIP_MODEL_DOWNLOAD=true`. Fail if images require live provider credentials during CI build. Block if Docker Buildx or network image pulls are unavailable.

Backend deploy workflow integration is GitHub/AWS-only. Pass if a backend-changing push to `main` runs CI first, validates repository variables, builds only changed server/AI images, pushes to ECR, scans, signs, deploys to ECS, waits for stability, and records rollback metadata. Fail if deployment runs without CI, missing variables, image digest checks, or protected `production-backend` environment review.

## Non-Functional Test Cases

Performance: pass if `task up:dev` readiness checks complete within 90 seconds per printed URL on a normal dev machine after dependencies are installed. Fail if startup hangs without a clear `[warn]` or `[fail]` message. Pass CI if `.github/workflows/ci.yml` completes under its `60` minute timeout. Fail if Docker builds exceed the timeout or disk budget.

Reliability: pass if `scripts/dev-up.sh` traps `EXIT`, `INT`, and `TERM`, then stops all child processes. Fail if Ctrl-C leaves server, console, web, AI API, or AI worker processes running.

Resilience: pass if `task doctor` reports missing prerequisites with actionable install hints and exits non-zero on required failures. Fail if missing Docker, Node, Python, corepack, or Compose is only a warning.

Security: pass if Docker services bind to localhost, examples contain placeholders only, dependency suppressions are not expired, Trivy scans run for backend deploy images, and cosign signs pushed images. Fail on public DB/Redis binds, live secrets in examples, expired suppressions, skipped image scan, or unsigned production image.

Compatibility: pass on Linux/Ubuntu-like environments with Bash, Docker Compose v2, Python 3, Node >=18, and pnpm 9. Fail if scripts assume Bash features without fallbacks where they already intend compatibility, such as `wait -n -p` fallback in `scripts/dev-up.sh`.

Concurrency: pass if backend deploy workflow uses concurrency group `quickvoice-backend-deploy-${{ github.ref }}` with `cancel-in-progress: false`, preventing overlapping deploys for the same ref without canceling an in-flight production deployment. Fail if concurrent deploys can update ECS task definitions out of order.

Data integrity: pass if `task deps:node` uses `--frozen-lockfile` and `task deps:update` is the only explicit lockfile update path. Fail if normal setup mutates `pnpm-lock.yaml`.

## UX, UI, Accessibility, And Compatibility Testing

Developer command UX: pass if `task --list` exposes understandable descriptions for setup, Docker, DB, dev, service-specific dev, and CI tasks. Fail if task names exist but descriptions are missing or misleading.

Doctor output UX: pass if `task doctor` prints `[ok]`, `[warn]`, and `[fail]` consistently and includes install hints for Ubuntu when required tools are missing. Fail if an intern cannot tell which prerequisite to install next.

Env bootstrap UX: pass if `scripts/dev-env.sh` ends with an “Env bootstrap checklist” and “Next commands” showing `task doctor` and `task up:dev`. Fail if the script silently creates files without explaining local-only defaults and external provider blockers.

Dev startup UX: pass if `scripts/dev-up.sh` prefixes logs with service names like `[server]`, `[console]`, `[web]`, `[ai-api]`, prints enabled and disabled services, and reports reachable URLs. Fail if logs from services are interleaved without prefixes or disabled AI worker state is hidden.

GitHub PR UX: pass if `.github/pull_request_template.md` asks for summary, issue/context, verification commands, dependency/audit suppression intent, UI screenshots, env changes, and broader checks for auth/billing/database/runtime worker changes. Fail if release reviewers cannot determine what was tested.

Issue UX: pass if `.github/ISSUE_TEMPLATE.md` includes setup blocker categories, provider credential categories, expected/actual behavior, reproduction path, and security disclosure redirection to `SECURITY.md`. Fail if the template encourages posting secrets.

Product UI accessibility is blocked in this root-tooling module. Pass this module if root commands start console/web reliably so app-specific modules can test layout, keyboard behavior, screen readers, forms, tables, dialogs, and responsive breakpoints. Fail root tooling if app URLs are printed but unavailable.

## Security, Privacy, And Compliance Checks

Secrets in templates:

```sh
grep -R "sk_live_\\|whsec_live_\\|AKIA[0-9A-Z]\\{16\\}" .env.dev.example apps/*/.env.dev.example
```

Pass if there are no matches. Fail if live-looking Stripe, webhook, or AWS access keys are committed.

Dependency audit:

```sh
pnpm audit:deps -- --audit-level low
```

Pass if no unsuppressed high or critical advisories remain and suppressions are valid. Fail if new unsuppressed advisories appear. Block if pnpm or registry access is unavailable.

Suppression governance: pass only if every entry in `security/audit-suppressions.json` has `id`, `reason`, `expires`, a valid context, and owner review before `2026-07-19`. Fail after `2026-07-19` unless entries are removed, renewed with justification, or dependencies are upgraded.

Local data privacy: pass if `.env.dev`, app env files, `.venv`, `.next`, `dist`, `.audit_runs`, `.testing_guide_runs`, `.ui_ux_audit_runs`, `.ui_ux_fix_runs`, and `.viral_launch_runs` remain ignored. Fail if generated local secrets or logs are tracked.

Supply chain: pass if `pnpm-lock.yaml` is the only tracked JS package-manager lockfile and `.github/dependabot.yml` covers npm, GitHub Actions, Docker in `/apps/server` and `/apps/ai`, and pip in `/apps/ai`. Fail if `package-lock.json`, `yarn.lock`, or `npm-shrinkwrap.json` is added.

Deployment security: pass if AWS credentials use GitHub OIDC via `aws-actions/configure-aws-credentials@v4`, production deploy is tied to environment `production-backend`, images are SHA-tagged and digest-deployed, and rollback metadata is written. Fail if static AWS keys are added to workflows or images deploy by mutable tags.

## Edge Cases And Failure Modes

Missing env template: temporarily move one template in a disposable checkout, then run `./scripts/dev-env.sh`. Pass if it prints `missing ...`, aborts before copying any files, and exits non-zero. Fail if it creates partial env files.

Existing env file: add a local-only marker to `.env.dev`, run `task env:dev`, and verify the marker remains. Pass if output says `kept .env.dev`. Fail if marker is overwritten.

Missing `task`: run `task --list` on a machine without go-task. Pass as a blocked prerequisite if the shell reports `task: command not found`. Fail the setup if docs or PR verification claim local tooling was checked anyway.

Missing `corepack`: run `task deps:node`. Pass as a blocked prerequisite if it exits with `corepack is required to activate pnpm@9.0.0.`. Fail if setup continues with an arbitrary pnpm version.

Docker daemon down: stop Docker and run `task doctor`. Pass if it fails with `Docker daemon is not reachable`. Fail if Docker is required but the command exits `0`.

Port conflict: bind port `5000`, `3000`, `3001`, `5432`, `6379`, or `5555`, then run `task doctor`. Pass if it warns that the port is already accepting connections. Fail if `task up:dev` later starts an ambiguous duplicate service without clear failure.

AI flags: set `AI_API_ENABLED=false` and run `scripts/dev-up.sh`. Pass if AI API is listed under optional disabled services. Set `AI_WORKER_ENABLED=true` only with valid LiveKit env; pass if worker starts or fails with a clear provider-credential error. Block real worker validation without LiveKit credentials.

Expired audit suppression: run `SECURITY_AUDIT_TODAY=2026-07-20 node scripts/security-audit.mjs --check-suppressions-only`. Pass if it exits non-zero and lists expired suppressions. Fail if expired suppressions are ignored.

Backend deploy missing variables: run the GitHub workflow manually in a repo/environment without required variables. Pass if “Validate deployment configuration” fails and lists missing `AWS_ROLE_ARN`, `AWS_REGION`, `ECR_REPOSITORY`, `AI_ECR_REPOSITORY`, `ECS_CLUSTER`, and `ECS_SERVICE`. Fail if deploy proceeds.

ECS container mismatch: configure `SERVER_ECS_CONTAINER_NAME` or `AI_ECS_CONTAINER_NAME` to a name absent from the current task definition. Pass if deploy fails before registering a bad task definition. Fail if it silently deploys the wrong container.

## Test Data, Fixtures, Accounts, And Roles

Local infrastructure credentials from root setup:

- Postgres user/password/db: `quickvoice` / `quickvoice` / `quickvoice`
- Database URL from server template: `postgresql://quickvoice:quickvoice@localhost:5432/quickvoice`
- Redis URL: `redis://localhost:6379`
- Internal API key placeholder: `dev-internal-key-change-me`
- Mailpit SMTP/UI: `localhost:1025` and `http://localhost:8025`

Provider placeholders in server env template include Google OAuth, LiveKit, Twilio, Telnyx, AWS S3, Stripe, SMTP, and Smithery values. These are placeholders only.

Seed requirements:

- `task db:seed -- --email you@example.com` requires an existing user with that email.
- `task db:seed -- --org-slug my-workspace` requires an existing organization with at least one member.
- Seed is safe to run multiple times but appends call logs. Use once per org unless testing duplicate dashboard volume.

Seed fixtures include three agents (`Sales Qualifier`, `Support Intake`, `Appointment Setter`), two phone numbers (`+14155550101`, `+14155550102`), 160 generated call logs, completed-call transcripts, and three knowledge sources (`Pricing FAQ`, `Product handbook`, `Refund policy`).

Relevant SaaS data models proven by the schema include `User`, `Session`, `Account`, `Verification`, `Apikey`, `Organization`, `OrganizationRole`, `Member`, `Invitation`, `Subscription`, `Secret`, and `AuditLog`. Default member role is `member`.

No shared test accounts, live credentials, paid vendor credentials, or production tenant fixtures are present in this module. Mark checks requiring them as blocked.

## External Services Or Blocked Checks

Blocked if `task` is unavailable. Pass once `task --list` works and shows all expected tasks. Fail if setup documentation claims go-task is optional for `pnpm dev`.

Blocked if `corepack` or `pnpm@9.0.0` is unavailable. Pass once `pnpm --version` prints `9.0.0` after activation. Fail if another pnpm version changes lockfile format or install behavior.

Blocked if Docker daemon or Buildx is unavailable. Pass once Compose config renders and `scripts/ci-docker-build.sh` builds both images. Fail if Docker builds require live provider secrets.

Blocked if npm, pip, Docker Hub, PyTorch CPU wheel index, or other package registries are unreachable. Pass when dependency installs complete with frozen lockfile and requirements. Fail if lockfile or requirements are modified to work around network issues without approval.

Blocked for production backend deploy without GitHub repo variables `AWS_ROLE_ARN`, `AWS_REGION`, `ECR_REPOSITORY`, `AI_ECR_REPOSITORY`, `ECS_CLUSTER`, and `ECS_SERVICE`. Pass when the workflow validates variables and deploys through protected `production-backend`. Fail if deploy bypasses the validation step.

Blocked for LiveKit, Twilio, Telnyx, Stripe, Google OAuth, production email, S3, Smithery, Pinecone, and Gemini-style AI provider checks without credentials and product-owner approval. Pass only with sandbox credentials, documented expected behavior, and no live customer data. Fail if tests use production credentials in local env files.

Blocked for frontend production deployment in GitHub Actions: no frontend deploy workflow exists under `.github/workflows` at this commit. Pass only if the owner identifies the separate deployment system and its checks. Fail if release acceptance assumes frontend deploy is covered by `backend-build.yml`.

## Regression Risks

Highest-risk regressions:

- `pnpm-lock.yaml` drift from normal setup instead of explicit `task deps:update`.
- `package.json` scripts diverging from GitHub CI or PR template expectations.
- `turbo.json` losing `.env*` inputs or build outputs, causing stale builds.
- Env templates missing required variables or containing live secrets.
- `scripts/dev-env.sh` overwriting local env files.
- Docker services binding to public interfaces.
- `scripts/dev-up.sh` leaving child processes after failure or Ctrl-C.
- `task docker:reset` deleting volumes without a prompt.
- `pnpm ci:local` no longer matching `.github/workflows/ci.yml`.
- Audit suppressions expiring on `2026-07-19` and failing releases.
- Backend deploy using mutable tags, missing image scans/signatures, wrong ECS container names, or no rollback metadata.
- Dependabot coverage dropping npm, GitHub Actions, Docker, or pip.
- Codex runner dry-run modes writing files or actual runner modes modifying tracked files outside their allowed workflow.

## Release Acceptance Checklist

- [ ] Checkout is at `3489a213063743d1c3a5a0465c327150d847097a` or the intended release commit, and tracked root-tooling files are clean before validation.
- [ ] Shell, Node, and Python AST syntax checks for `scripts` pass.
- [ ] `node scripts/verify-turbo-tasks.mjs` passes.
- [ ] Root Node test subset passes all 24 tests.
- [ ] Docker Compose default and `mail` profile configs render successfully with localhost-bound ports.
- [ ] `task --list` works on the release validation machine.
- [ ] `task doctor` exits `0` on a fully provisioned dev machine.
- [ ] `task env:dev` creates missing local env files and preserves existing local env files.
- [ ] `task docker:up` starts healthy Postgres and Redis; `task docker:down` stops them; `task docker:reset` prompts before deleting volumes.
- [ ] `task db:migrate` applies migrations against local Postgres.
- [ ] `task db:seed` is tested with an existing user or org and does not cross tenant boundaries.
- [ ] `task up:dev` starts expected services and health endpoints respond.
- [ ] `pnpm ci:local` passes in an environment with dependencies, Python requirements, and Docker Buildx.
- [ ] `pnpm audit:deps -- --audit-level low` passes or every temporary suppression has explicit owner sign-off before its expiry date.
- [ ] GitHub PR checks for CI and Security Audit pass on the branch.
- [ ] Backend deploy workflow is tested or explicitly blocked with missing AWS/GitHub variables documented.
- [ ] If deploying backend, images are scanned, signed, digest-deployed to ECS, service stability is reached, and rollback metadata is captured.
- [ ] All blocked live-vendor checks are recorded with the missing credential/service and exact owner needed to unblock.
