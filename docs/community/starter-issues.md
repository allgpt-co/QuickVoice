# Starter Issue Drafts

These are maintainer-reviewed drafting briefs for future GitHub issues. They are not live assignments. Maintainers should open only the issues they are ready to triage, check again for duplicates, and add an assignee under the policy in [CONTRIBUTING.md](../../CONTRIBUTING.md).

All drafts are designed to be completed without paid services, live provider credentials, production data, or calls to real people.

Effort estimates assume a contributor who has completed the local setup:

- **XS:** a few focused hours
- **S:** roughly one working day
- **M:** several focused days with review

## 1. Add A Local Markdown Relative-Link Checker

**Proposed title:** `[Docs] Add a local checker for broken relative Markdown links`

**Why:** The repository has many Markdown files and no dedicated command that catches renamed or missing relative targets before review.

**Scope:**

- Add a dependency-light script under `scripts/` that scans tracked Markdown files.
- Validate relative file links and same-file heading fragments.
- Ignore `http:`, `https:`, `mailto:`, image data, and example placeholders.
- Add a root package command and a narrow Node test for the checker.

**Acceptance criteria:**

- [ ] A valid repository link passes on Windows and Linux when invoked through Node.
- [ ] A test fixture with a missing file fails with the source path and line number.
- [ ] URL fragments are decoded before matching headings.
- [ ] Generated/build/vendor directories are excluded explicitly.
- [ ] Contributor docs list the new command.

**Suggested labels:** `documentation`, `good first issue`

**Effort:** S

**Verification:**

```sh
pnpm <new-docs-check-command>
node --test tests/<new-link-checker-test>.test.mjs
```

**Out of scope:** Crawling external websites or changing unrelated prose.

## 2. Add A Pinned Node Version Convenience File

**Proposed title:** `[Tooling] Add a Node version file that agrees with package.json`

**Why:** `package.json` defines the minimum Node version, but common version managers do not have a repository-level version hint.

**Scope:**

- Choose either `.nvmrc` or `.node-version` after maintainer agreement.
- Select a maintained Node release that satisfies `engines.node`.
- Add a test that prevents the version file and `package.json` requirement from contradicting each other.
- Document that CI may use a newer supported Node version.

**Acceptance criteria:**

- [ ] The chosen file contains one valid Node version.
- [ ] The version satisfies `^20.19 || ^22.13 || >=24`.
- [ ] A narrow test fails if the version falls below the engine requirement.
- [ ] README setup guidance explains that the file is a convenience, not the complete support range.

**Suggested labels:** `enhancement`, `good first issue`

**Effort:** XS

**Verification:**

```sh
node --test tests/dev-orchestration.test.mjs
node -p "process.version"
```

**Out of scope:** Changing the package manager or CI Node version.

## 3. Add A Simulated Prerequisite Test Harness For Dev Doctor

**Proposed title:** `[Tests] Exercise dev-doctor prerequisite failures with a controlled PATH`

**Why:** Current tests inspect the doctor script text; they do not prove that old Node/Bash versions and missing tools produce actionable diagnostics.

**Scope:**

- Add a shell-test fixture or Node-driven subprocess harness for `scripts/dev-doctor.sh`.
- Stub tool executables in a temporary directory instead of modifying the host.
- Cover at least unsupported Node, missing Corepack, and missing Go Task.
- Keep Docker daemon checks isolated from unit scenarios.

**Acceptance criteria:**

- [ ] Tests do not install packages or alter the contributor's global `PATH`.
- [ ] Unsupported Node output names the `^20.19 || ^22.13 || >=24` requirement.
- [ ] Missing-tool output names the exact prerequisite.
- [ ] Temporary files are cleaned up on success and failure.
- [ ] The test runs in Linux CI without provider credentials.

**Suggested labels:** `enhancement`, `good first issue`

**Effort:** M

**Verification:**

```sh
node --test tests/<new-doctor-test>.test.mjs
```

**Out of scope:** Starting Docker services or weakening doctor failures.

## 4. Add A WSL2 And Docker Desktop Troubleshooting Guide

**Proposed title:** `[Docs] Document WSL2 and Docker Desktop setup failure modes`

**Why:** The README identifies WSL2 as the Windows path but does not yet provide a focused troubleshooting runbook.

**Scope:**

- Add `docs/setup/windows-wsl2.md`.
- Cover Docker Desktop WSL integration, Linux-filesystem clone location, line endings, port conflicts, and checking Compose availability.
- Show only diagnostic commands that do not reveal environment values.
- Link the guide from the README and setup issue form if the issue-form schema supports the link cleanly.

**Acceptance criteria:**

- [ ] The guide distinguishes WSL2 from native PowerShell.
- [ ] Commands are tested in an Ubuntu WSL2 shell.
- [ ] The guide explains when not to install a second Docker daemon.
- [ ] The guide includes a redaction warning before log-sharing instructions.
- [ ] All relative links pass the repository docs check, if available.

**Suggested labels:** `documentation`, `good first issue`

**Effort:** S

**Verification:**

```sh
bash --version
docker compose version
task doctor
```

**Out of scope:** Supporting native Windows orchestration or publishing Docker Desktop credentials.

## 5. Add A macOS Modern-Bash Setup Guide

**Proposed title:** `[Docs] Add tested macOS prerequisites and modern Bash troubleshooting`

**Why:** macOS ships Bash 3.2 while QuickVoice orchestration uses Bash 4+ features.

**Scope:**

- Add `docs/setup/macos.md`.
- Explain how `#!/usr/bin/env bash` resolves Bash from `PATH`.
- Document checks for modern Bash, Node, Corepack, Python, Docker Compose, and Go Task.
- Include Intel and Apple Silicon path notes only where verified.

**Acceptance criteria:**

- [ ] A contributor can confirm which Bash the scripts will use.
- [ ] The guide avoids replacing `/bin/bash` or editing protected system files.
- [ ] Commands do not assume paid providers or production configuration.
- [ ] The root README links the guide.
- [ ] A maintainer records the macOS version used for verification in the PR.

**Suggested labels:** `documentation`, `good first issue`

**Effort:** S

**Verification:**

```sh
command -v bash
bash --version
task doctor
```

**Out of scope:** A native GUI installer or support for Bash 3.2.

## 6. Add A Docker Compose Health Runbook

**Proposed title:** `[Docs] Add a local Postgres and Redis health troubleshooting runbook`

**Why:** The Compose file has health checks, but contributors need a safe path from an unhealthy service to useful diagnostics.

**Scope:**

- Add `docs/setup/docker-health.md`.
- Explain `docker compose ps`, health status, localhost-bound ports, and redacted logs.
- Cover port collisions and the difference between `docker:down` and destructive `docker:reset`.
- Warn that `task docker:reset` removes local development volumes.

**Acceptance criteria:**

- [ ] Every command uses `docker-compose.dev.yml` and the development env file consistently.
- [ ] The guide never recommends printing an entire env file.
- [ ] Data-destructive steps are clearly marked and are not the first troubleshooting step.
- [ ] Postgres and Redis recovery paths are separate.
- [ ] README or SUPPORT links to the guide.

**Suggested labels:** `documentation`, `good first issue`

**Effort:** S

**Verification:**

```sh
task env:dev
task docker:up
docker compose -f docker-compose.dev.yml --env-file .env.dev ps
task docker:down
```

**Out of scope:** Production database recovery or backup guarantees.

## 7. Add A Mailpit Local Email Smoke-Test Guide

**Proposed title:** `[Docs] Document a credential-free Mailpit email smoke test`

**Why:** Mailpit is available as an optional Compose profile, but the current docs only show how to start it.

**Scope:**

- Add a short guide that starts Mailpit, identifies the local SMTP and UI ports, and sends a synthetic message.
- Use a local-only recipient such as `example@localhost`.
- Explain which app flow is not covered without configured auth or provider credentials.
- Include cleanup with `task mail:down`.

**Acceptance criteria:**

- [ ] The smoke test never contacts an external SMTP service.
- [ ] The example contains no real name, address, token, or customer content.
- [ ] The message appears in the Mailpit UI at `http://localhost:8025`.
- [ ] Startup and cleanup commands match `Taskfile.yml`.
- [ ] Failure guidance covers port 1025 or 8025 already being used.

**Suggested labels:** `documentation`, `good first issue`

**Effort:** XS

**Verification:**

```sh
task mail:up
task mail:down
```

**Out of scope:** Testing production email delivery or DNS configuration.

## 8. Add An Environment-Template Key Inventory Checker

**Proposed title:** `[Tooling] Detect undocumented drift across development env templates`

**Why:** QuickVoice has root, server, AI, console, and web development templates. Key changes can drift without a reviewable inventory.

**Scope:**

- Parse only tracked `*.env.dev.example` files.
- Emit key names, owning template, and whether the value is an obvious placeholder; never emit secret values.
- Add a check for duplicate keys whose documented local URLs or internal-key placeholders must agree.
- Add unit fixtures that contain synthetic values only.

**Acceptance criteria:**

- [ ] Output contains variable names and file paths but no values.
- [ ] Commented and blank lines are handled.
- [ ] Duplicate-key rules are explicit rather than inferred from naming alone.
- [ ] A mismatched fixture fails with a useful message.
- [ ] The checker runs without loading `.env.dev` or `.env.local`.

**Suggested labels:** `enhancement`, `good first issue`

**Effort:** M

**Verification:**

```sh
node --test tests/<new-env-inventory-test>.test.mjs
pnpm <new-env-check-command>
```

**Out of scope:** Validating live credentials or connecting to providers.

## 9. Add A Provider Credential Boundary Matrix

**Proposed title:** `[Docs] Map features to required external providers and local substitutes`

**Why:** Setup docs list providers, but evaluators need one factual table showing which workflows can be inspected locally and which require their own accounts.

**Scope:**

- Add `docs/setup/provider-boundaries.md`.
- Cover LiveKit, Twilio, Telnyx, speech/model providers, Pinecone, S3-compatible storage, Stripe, OAuth, and email.
- Ground every row in a tracked env template and current code path.
- State whether a local substitute exists, such as Mailpit for SMTP.

**Acceptance criteria:**

- [ ] Every provider row cites a repository path.
- [ ] The table distinguishes service startup from successful provider-backed behavior.
- [ ] No row claims a partnership, certification, SLA, or included account.
- [ ] Examples use variable names only and never credential values.
- [ ] README setup boundaries link the matrix.

**Suggested labels:** `documentation`, `help wanted`

**Effort:** M

**Verification:**

```sh
rg -n "LIVEKIT_|TWILIO_|TELNYX_|STRIPE_|PINECONE_|SMTP_|AWS_" \
  .env.dev.example apps/server/.env.dev.example apps/ai/.env.dev.example
```

**Out of scope:** Provider pricing comparisons or account setup on behalf of users.

## 10. Add And Validate A Supported Dev Container

**Proposed title:** `[Dev Container] Add a supported contributor container and validate it in CI`

**Why:** The repository does not yet provide a Dev Container, so contributors need an optional, reproducible environment that is validated rather than implied.

**Scope:**

- Add a minimal `.devcontainer/devcontainer.json` and any narrowly required supporting files.
- Base the environment on the documented Linux or WSL2 prerequisites without embedding credentials.
- Add a narrowly scoped workflow or test that parses and builds the configuration.
- Parse the resolved configuration with the Dev Container CLI.
- Verify Node, Python, Docker Compose, Corepack, pnpm, and Go Task versions in the built container.
- Do not start the full application or external provider integrations.

**Acceptance criteria:**

- [ ] The container setup documents its supported host assumptions and resource requirements.
- [ ] The check runs only when Dev Container or setup files change, unless maintainers choose a scheduled run.
- [ ] Feature references resolve and the container builds on the selected CI architecture.
- [ ] Version output proves Node satisfies `^20.19 || ^22.13 || >=24`.
- [ ] The check does not require repository secrets.
- [ ] Failures identify whether parsing, feature installation, build, or post-create setup failed.

**Suggested labels:** `enhancement`, `help wanted`

**Effort:** M

**Verification:**

```sh
npx --yes @devcontainers/cli read-configuration --workspace-folder .
npx --yes @devcontainers/cli build --workspace-folder .
```

**Out of scope:** Running real calls or deploying the built development container.

## 11. Add A Local API Health Smoke Command

**Proposed title:** `[Tooling] Add a credential-free local API health smoke command`

**Why:** Contributors currently copy a health URL from the README; a small command could provide consistent diagnostics after startup.

**Scope:**

- Add a cross-platform Node script that requests the configured local API health endpoint.
- Use a short timeout and clear exit codes.
- Report HTTP status and response shape without logging headers or environment values.
- Add synthetic-server tests.

**Acceptance criteria:**

- [ ] The command passes against a local synthetic healthy response.
- [ ] Connection refusal, timeout, non-success status, and invalid JSON have distinct messages.
- [ ] The default URL matches the root development port.
- [ ] An override accepts a URL argument without loading env files.
- [ ] The script requires no provider credentials.

**Suggested labels:** `enhancement`, `good first issue`

**Effort:** S

**Verification:**

```sh
node --test tests/<new-health-smoke-test>.test.mjs
pnpm <new-health-command>
```

**Out of scope:** A production uptime monitor or authenticated endpoint testing.

## 12. Add A Package-Local Console Test Command

**Proposed title:** `[Console] Expose the existing console tests through its package scripts`

**Why:** Root tests run `apps/console/tests/*.test.mjs`, but `apps/console/package.json` has no package-local `test` command.

**Scope:**

- Add a `test` script to `apps/console/package.json`.
- Decide whether Turborepo should invoke it or whether it remains an explicit package command.
- Update root task-verification tests and console documentation.
- Preserve the existing test runner and file set.

**Acceptance criteria:**

- [ ] `pnpm --filter console test` runs every existing console `.test.mjs` file.
- [ ] The root `pnpm test` does not run the same suite twice.
- [ ] No new test dependency is added.
- [ ] CI task verification reflects the chosen wiring.
- [ ] Console README shows the package-local command.

**Suggested labels:** `enhancement`, `good first issue`

**Effort:** XS

**Verification:**

```sh
pnpm --filter console test
pnpm check:tasks
node --test tests/dev-orchestration.test.mjs
```

**Out of scope:** Migrating the console tests to another framework.

## 13. Add Console-To-API Connectivity Troubleshooting

**Proposed title:** `[Docs] Document console API connectivity and CORS diagnostics`

**Why:** Running only the console can look successful even when the API, database, or configured server URL is unavailable.

**Scope:**

- Add a troubleshooting section to `apps/console/README.md` or a linked setup guide.
- Cover the API health route, `NEXT_PUBLIC_SERVER_URL`, browser network errors, and port mismatches.
- Distinguish connection failures from authentication and provider failures.
- Use redacted browser evidence examples.

**Acceptance criteria:**

- [ ] The guide begins with the API health check.
- [ ] It explains when `.env.local` is created and when a restart is required after changing it.
- [ ] It does not tell users to disable browser security or broad CORS protections.
- [ ] It warns against sharing cookies, authorization headers, or full HAR files publicly.
- [ ] Commands match current default ports.

**Suggested labels:** `documentation`, `good first issue`

**Effort:** XS

**Verification:**

```sh
task server:dev
task console:dev
```

Review the browser network panel using synthetic local data only.

**Out of scope:** Debugging a private production deployment.

## 14. Add A Changelog And Release-Note Consistency Check

**Proposed title:** `[Release] Check release metadata before a tag is created`

**Why:** Release notes, changelog entries, version names, and known-limit sections can diverge during manual preparation.

**Scope:**

- Add a Node script that accepts a candidate version.
- Confirm the changelog has the expected release heading before publish mode.
- Confirm the matching release-notes file exists and includes status, install requirements, known limitations, and verification.
- Provide a draft mode that passes while v0.1.0 remains explicitly unreleased.

**Acceptance criteria:**

- [ ] Draft mode recognizes `v0.1.0-draft.md` without claiming a release exists.
- [ ] Publish mode fails if the changelog, filename, title, and candidate version disagree.
- [ ] Tests use temporary synthetic Markdown fixtures.
- [ ] The script does not create a tag, release, commit, or remote change.
- [ ] The release checklist documents the command.

**Suggested labels:** `enhancement`, `good first issue`

**Effort:** S

**Verification:**

```sh
node --test tests/<new-release-metadata-test>.test.mjs
pnpm <new-release-check-command> -- v0.1.0 --draft
```

**Out of scope:** Automatically publishing a release.

## 15. Add A Sanitized Reproduction Fixture Guide

**Proposed title:** `[Community] Add safe fixtures for bug reproductions and tests`

**Why:** Voice-agent bugs can involve call metadata, phone numbers, transcripts, provider payloads, and signed URLs that should not be copied from real users.

**Scope:**

- Add `docs/community/safe-reproduction-data.md`.
- Define synthetic formats for phone numbers, emails, call IDs, transcripts, webhook URLs, provider IDs, and credentials.
- Reference existing test fixtures that already use safe placeholders.
- Add a checklist maintainers can link during issue triage.

**Acceptance criteria:**

- [ ] Examples are clearly synthetic and non-routable where applicable.
- [ ] The guide distinguishes redaction from irreversible secret rotation after exposure.
- [ ] It warns that changing a few characters in a real transcript may still expose personal data.
- [ ] It links `SECURITY.md` for vulnerabilities and `SUPPORT.md` for public reports.
- [ ] Bug and setup form wording remains consistent with the guide.

**Suggested labels:** `documentation`, `good first issue`

**Effort:** S

**Verification:**

```sh
rg -n "sk_live_|whsec_live_|AKIA[0-9A-Z]{16}" docs/community tests
```

The command should find no real-secret-shaped examples introduced by the change.

**Out of scope:** Publishing sanitized production recordings or customer transcripts.
