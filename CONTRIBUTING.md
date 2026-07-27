# Contributing To QuickVoice

Thanks for helping improve QuickVoice. This repo is open source so teams can inspect, self-host, and extend AI phone-agent infrastructure.

## Positioning Guardrails

QuickVoice is the open-source, self-hostable Retell alternative for teams that want more control over AI phone-agent infrastructure. When you touch public copy, docs, examples, or launch material:

- Emphasize control, self-hosting, privacy review, cost visibility, and extensibility.
- Compare against closed hosted APIs by explaining tradeoffs, not by attacking competitors.
- Do not invent customer metrics, benchmarks, screenshots, compliance status, or provider partnerships.
- Be explicit when real calls, billing, OAuth, email, storage, or production deployment require external credentials and operational decisions.

## Good First Contributions

A good first contribution should be scoped enough that a new contributor can finish it without production credentials, product decisions, or deep architecture context.

Good candidates:

- Bug fixes with a clear reproduction and a small expected behavior.
- Documentation improvements for local setup, telephony providers, deployment, or env boundaries.
- Tests for existing behavior.
- Broken links, confusing copy, or missing setup notes in docs and launch material.
- Small product improvements that follow existing UI patterns and do not introduce a new dependency or migration.
- Integration notes for LiveKit, Twilio, Telnyx, Stripe, Postgres, or S3-compatible storage when they document current behavior.

Poor first issues:

- Changes that require live customer data, paid services, provider dashboards, or production secrets.
- New auth, billing, telephony, database, worker-runtime, or deployment architecture.
- Broad redesigns, new provider integrations, or compliance claims.
- Performance, cost, customer, or reliability claims without public evidence.

For larger changes, open an issue first so we can agree on the approach before you spend time on implementation.

During launch windows, maintainers should keep first-time contributors unblocked with a short first response even when a full answer needs more investigation. See [Launch Day Triage](./docs/launch/launch-day-triage.md) for response expectations and good-first-issue criteria.

Fifteen credential-free contribution briefs are maintained in [Starter Issue Drafts](./docs/community/starter-issues.md). They are planning material until a maintainer opens and assigns the corresponding GitHub issue.

## Before You Start

1. Search open issues and pull requests for the same problem, file, or proposed outcome.
2. For anything beyond a typo or obviously isolated documentation fix, open or choose an issue before writing code.
3. Comment with the exact part you plan to change and how you will verify it. A maintainer assigns the issue after confirming the scope.
4. Start work only after assignment. Assignment prevents two contributors from being asked to solve the same task.

Assignment is a coordination signal, not a guarantee that a pull request will merge. Post a short progress note if the work takes more than seven calendar days. After a maintainer check-in, an issue with no response or visible progress for seven days may be unassigned so another contributor can proceed.

Do not open competing pull requests for an assigned issue unless a maintainer explicitly asks for an alternative. If duplicate work arrives, maintainers normally continue with the assigned, in-scope approach; useful ideas from a duplicate may be credited or incorporated with permission. Maintainers may close unrequested bulk changes, generated issue floods, and PRs that combine unrelated fixes.

## Non-Code Support

If QuickVoice is useful but you are not ready to open an issue or PR, starring the GitHub repo helps surface interest in open voice-agent infrastructure. Setup reports and docs feedback are still more actionable than stars when something is unclear or broken.

## Local Setup

QuickVoice uses `pnpm@9.0.0`, Turborepo, Docker, Postgres, Node.js `^20.19 || ^22.13 || >=24`, and Python for the AI worker. Python 3.12 matches CI and the runtime container.

The root development tasks are Bash-based and require Bash `>=4`. Linux is supported directly. macOS contributors need a modern Bash in `PATH` because the system Bash 3.2 is too old. Windows contributors should use WSL2 with Docker Desktop integration; native PowerShell is not a supported path for `task up:dev`.

Run the prerequisite check before the full stack:

```sh
task doctor
task up:dev
```

The task can start the local services with placeholder configuration, but real calls and provider-backed flows still require external credentials. See the root [Quick Start](./README.md#quick-start) and [Setup Boundaries](./README.md#setup-boundaries). Never paste credentials, access tokens, phone numbers belonging to real people, recordings, transcripts, or customer data into issues, pull requests, fixtures, or screenshots.

Useful checks:

```sh
pnpm lint
pnpm check-types
pnpm test
pnpm build
pnpm ci:local
pnpm audit:deps -- --audit-level low
```

Run the narrowest check that proves your change, then run broader checks when touching shared code, API contracts, auth, billing, database models, or runtime agent behavior.

## Pull Request Guidelines

- Keep PRs focused on one change.
- Link the assigned issue when one is required.
- Describe the user-facing impact.
- Include screenshots or recordings for UI changes.
- Include test evidence in the PR body.
- Avoid unrelated formatting or dependency churn.
- Do not commit local env files, credentials, generated secrets, or private customer data.
- If AI-assisted tools were used, review every changed line and be able to explain and test the result; the contributor remains responsible for the submission.

Draft pull requests are welcome for early design feedback, but they do not replace assignment. Maintainers may ask for a design note before changes to auth, billing, telephony, database schema, runtime workers, public APIs, security controls, or deployment architecture.

## Development Notes

- `apps/web` contains the public website.
- `apps/console` contains the product console.
- `apps/server` contains the API and Prisma schema.
- `apps/ai` contains the Python AI service and LiveKit worker handlers.
- Shared TypeScript and lint configuration live under `packages/`.

## License

By contributing, you agree that your contributions are licensed under the MIT License, as described in [LICENSE](./LICENSE).

Project decision-making and maintainer responsibilities are documented in [GOVERNANCE.md](./GOVERNANCE.md) and [MAINTAINERS.md](./MAINTAINERS.md).
