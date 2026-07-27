# QuickVoice Release Checklist

This checklist governs repository-level source releases such as `v0.1.0`. QuickVoice is a private pnpm workspace and does not currently promise that its individual packages are published to a package registry.

Complete the checklist on a dedicated release pull request. A draft release note or version-shaped filename is not a release. Only an approved Git tag and published GitHub release establish a released version.

## 1. Define The Candidate

- [ ] Choose a semantic version and describe why the change is major, minor, or patch relative to the previous tag.
- [ ] Confirm the release commit is on the protected default branch and the worktree is clean.
- [ ] List the exact commit range. For the first release, record the selected release commit because there is no previous tag.
- [ ] Move relevant `CHANGELOG.md` entries from `Unreleased` into a dated version section.
- [ ] Copy or rename the draft release notes to the final version path and remove every `draft` / `not released` marker only when publication is approved.
- [ ] Confirm the notes describe only behavior evidenced by the candidate commit.

## 2. Install And Static Checks

Use Node.js `^20.19 || ^22.13 || >=24`; CI currently uses Node 24. Start from a clean dependency install.

```sh
corepack prepare pnpm@9.0.0 --activate
pnpm install --frozen-lockfile
pnpm check:tasks
pnpm check:configs
pnpm lint
pnpm check-types
pnpm build
```

- [ ] Each command passes at the release commit.
- [ ] Any warning accepted for release is copied into the release PR with an owner and follow-up issue.
- [ ] Documentation links and GitHub issue-form YAML pass their schema/sanity checks.
- [ ] If a Dev Container configuration is present, it resolves and builds from a clean cache.

## 3. Automated Tests And Images

```sh
pnpm test
pnpm ci:python
pnpm ci:docker
pnpm audit:deps -- --audit-level high
```

- [ ] Node and console tests pass.
- [ ] Server tests pass.
- [ ] AI Python tests pass in Python 3.12.
- [ ] Server and AI container builds pass.
- [ ] High-severity dependency findings are fixed or covered by a documented, unexpired suppression.
- [ ] Required default-branch checks pass in GitHub for the exact release commit.

The full local CI command is:

```sh
pnpm ci:local
```

Do not report a narrower check as the full release suite.

## 4. Local Smoke Test

Use synthetic data and development-only credentials.

```sh
task doctor
task up:dev
```

- [ ] Postgres and Redis become healthy.
- [ ] Prisma migrations apply to a disposable local database.
- [ ] Console responds at `http://localhost:3000`.
- [ ] Marketing site responds at `http://localhost:3001`.
- [ ] API health responds at `http://localhost:5000/api/v1/health`.
- [ ] API docs respond at `http://localhost:5000/api/v1/docs`.
- [ ] AI API health responds at `http://localhost:5555/health` when enabled.
- [ ] Stopping the task terminates the processes it started.

A local smoke test does not validate real telephony, OAuth, billing, email delivery, storage, vector search, or model inference.

## 5. Provider-Connected Staging Checks

Run these only in a maintainer-controlled staging environment with authorized accounts, test numbers, consent, budget limits, and secrets outside the repository.

- [ ] Record which LiveKit and telephony paths were tested.
- [ ] Record which speech/model path was tested.
- [ ] Confirm inbound or outbound call consent and recording disclosures for the test jurisdiction.
- [ ] Confirm call termination, error handling, log redaction, transcript/recording behavior, and cleanup.
- [ ] Confirm provider webhooks are authenticated and retry behavior is understood.
- [ ] Record any provider path not tested as a known limitation; do not imply coverage.

Never paste the credentials, raw provider payloads, real phone numbers, recordings, transcripts, or customer data into the release pull request.

## 6. Operations, Data, And Security Review

- [ ] Review database migrations for forward and rollback/restore implications.
- [ ] Review environment-template changes and deployment configuration requirements.
- [ ] Confirm no secret, private key, signed URL, customer data, or generated local env file is in the release diff.
- [ ] Review authentication, authorization, organization isolation, retention, upload, webhook, tool-execution, and SSRF-relevant changes.
- [ ] Verify production operators have backup, restore, monitoring, rate-limit, domain/TLS, storage, and secret-management plans appropriate to their deployment.
- [ ] Confirm `SECURITY.md`, `SUPPORT.md`, and known limitations remain accurate.

## 7. Prepare The GitHub Release

- [ ] Create a **draft** GitHub release for the candidate version.
- [ ] Use the final release-note file as the source; do not add unsupported marketing claims in the GitHub editor.
- [ ] Link the changelog and compare view.
- [ ] Credit merged community contributions accurately.
- [ ] Have the release approver review the candidate commit, version, notes, known limits, and checklist evidence.

## 8. Publish

Only after approval:

- [ ] Create the annotated version tag at the reviewed commit.
- [ ] Push the tag.
- [ ] Confirm any tag-triggered checks complete.
- [ ] Publish the GitHub release.
- [ ] Verify the tag, release page, source archives, links, and notes from a logged-out view.
- [ ] Announce only the artifacts and capabilities that were actually published and verified.

If a release-blocking check fails, fix it on the default branch, select a new candidate commit, and rerun affected checks. Do not move or reuse a published tag.

## 9. After Publication

- [ ] Open issues for accepted limitations and failed optional checks.
- [ ] Monitor setup, regression, and security reports.
- [ ] Add the next `Unreleased` section to `CHANGELOG.md` if needed.
- [ ] Record urgent fixes as a new patch candidate; never silently replace release source.
