# Shared lint and TypeScript configuration Testing Guide

## Intern Testing Orientation

- Scope commit: `3489a213063743d1c3a5a0465c327150d847097a`; first verify with `git rev-parse HEAD`.
- Scope files: `packages/eslint-config`, `packages/typescript-config`, `apps/console/eslint.config.mjs`, `apps/console/package.json`, `apps/web/eslint.config.mjs`, `apps/web/package.json`, root `package.json`, `pnpm-lock.yaml`, and `turbo.json`.
- This module has no product route, screen, database model, webhook handler, background worker, or customer-data API. Treat it as a shared quality-gate module for the rest of QuickVoice.
- Do not run `pnpm format`; it rewrites files. Run tests in a clean workspace and confirm no unexpected `git status --short` changes afterward.
- In this inspection shell, `node --check` for ESLint preset files passed, JSON parsing passed, `node scripts/verify-turbo-tasks.mjs` passed, and `node --test packages/typescript-config/test.mjs` passed 8 tests. `pnpm` and `corepack` were unavailable, so pnpm-managed gates were blocked here.

## Module Overview

- `@repo/eslint-config` exports flat ESLint presets from `packages/eslint-config/package.json`: `./base`, `./next-js`, `./nextjs`, `./react-internal`, `./react-library`, and `./type-checked`.
- `base.js` composes `@eslint/js`, `eslint-config-prettier`, `typescript-eslint` recommended rules, and `eslint-plugin-turbo`; `turbo/no-undeclared-env-vars` must stay `"error"`.
- `next.js` exports `nextJsConfig`, composing base plus `eslint-config-next/core-web-vitals`, `eslint-config-next/typescript`, and default Next ignores.
- `react-internal.js` exports a React library preset with React, React Hooks, browser globals, service worker globals, and `"react/react-in-jsx-scope": "off"`.
- `type-checked.js` exports opt-in `typeCheckedConfig` with `parserOptions.projectService: true` and type-aware rules such as `@typescript-eslint/no-floating-promises`.
- `@repo/typescript-config` exports JSON presets for `base`, `browser`, `node`, `next-js`/`nextjs`, `react-library`/`react-internal`, and `strict`.

## Architecture And Data Flow Testing

- Workspace flow: `pnpm-workspace.yaml` includes `apps/*` and `packages/*`; `pnpm-lock.yaml` should link app dev dependencies to `../../packages/eslint-config` and `../../packages/typescript-config`.
- Lint flow: root `pnpm lint` runs `turbo run lint`; console and web run `eslint --max-warnings=0`; each app imports `nextJsConfig` from `@repo/eslint-config/next-js`.
- Config validation flow: root `pnpm check:configs` must run `pnpm --filter @repo/eslint-config lint && pnpm --filter @repo/typescript-config lint`.
- TypeScript flow: console and web declare `@repo/typescript-config: workspace:*`, but their current `tsconfig.json` files are app-local Next-style configs rather than extending `@repo/typescript-config/next-js`; record this as a coverage gap unless an owner explicitly accepts it.
- Turbo env flow: `turbo.json` declares `globalEnv` as `["CONTACT_WEBHOOK_URL", "NODE_ENV"]`; the ESLint Turbo rule should fail undeclared env usage.
- Pass if all dependency links, exports, imports, scripts, and Turbo env settings match the files above. Fail on missing exports, direct app imports from `eslint-config-next`, warning-only lint gates, stale lockfile links, or unapproved TypeScript preset non-adoption.

## Setup And Required Services

- Required local tools: Node.js `>=18` from root `package.json`; GitHub CI uses Node `20`; root `packageManager` is `pnpm@9.0.0`.
- Required install command in a disposable test workspace: `pnpm install --frozen-lockfile`.
- No database, Redis, telephony provider, AI provider, Stripe account, object storage, OAuth provider, or email provider is required for this module’s scoped checks.
- Environment variables needed for this module: none for package tests; `CONTACT_WEBHOOK_URL` and `NODE_ENV` are only Turbo cache/input declarations in `turbo.json`.
- Pass setup if `pnpm --version` returns a 9.x version and `pnpm install --frozen-lockfile` succeeds without modifying `pnpm-lock.yaml`. Block if `pnpm` or registry access is unavailable.

## Automated Test Commands

```sh
git rev-parse HEAD
node --check packages/eslint-config/base.js
node --check packages/eslint-config/next.js
node --check packages/eslint-config/react-internal.js
node --check packages/eslint-config/type-checked.js
node --test packages/typescript-config/test.mjs
node scripts/verify-turbo-tasks.mjs
pnpm check:configs
pnpm --filter @repo/eslint-config lint
pnpm --filter @repo/typescript-config lint
pnpm --filter console lint
pnpm --filter web lint
```

- Pass: commit matches the requested SHA; Node syntax checks exit 0; TypeScript config tests report 8 passing tests; task verifier prints `All expected package scripts are present.`; pnpm lint/config commands exit 0 with zero warnings.
- Fail: any command exits nonzero, any app lint command emits warnings despite `--max-warnings=0`, or `git status --short` shows unexpected generated/tracked changes.
- Blocked in environments without `pnpm`: `pnpm check:configs`, package lint scripts, and app lint scripts. Do not mark them passed from static inspection alone.

## Functional Test Cases

- ESLint exports: inspect `packages/eslint-config/package.json`; pass if exactly the six supported subpaths are exported and aliases map to the same files as documented. Fail on removed aliases such as `./nextjs` or `./react-library`.
- Base ESLint coverage: inspect `base.js`; pass if it includes JS recommended, Prettier compatibility, TypeScript recommended rules, Turbo plugin, `turbo/no-undeclared-env-vars: "error"`, and `dist/**` ignore. Fail if `onlyWarn` or warning severity appears.
- Next ESLint coverage: inspect `next.js`; pass if it composes base, `core-web-vitals`, TypeScript Next config, and ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts`. Fail if apps must import `eslint-config-next` directly.
- React preset coverage: inspect `react-internal.js`; pass if React Hooks recommended rules, browser/serviceworker globals, React version detection, and JSX-scope disablement are present. Fail if base layers are omitted.
- Type-aware preset: inspect `type-checked.js`; pass if it is opt-in, TypeScript-file scoped, uses `projectService: true`, and throws if type-checked rules are unavailable. Fail if type-aware lint is forced into base/Next presets.
- TypeScript presets: inspect each JSON file; pass if `base` is runtime-neutral `ES2022`, `browser` adds DOM libs, `node` adds `types: ["node"]`, `nextjs` uses Bundler/Next/noEmit, `react-library` uses `react-jsx`, and `strict` adds unused/return/fallthrough/exact-optional checks.
- App consumers: inspect console and web ESLint configs and package manifests; pass if both import `@repo/eslint-config/next-js`, declare both shared packages as `workspace:*`, use `eslint --max-warnings=0`, and align `next` with `eslint-config-next` at `16.2.9`.
- Root quality gates: inspect root `package.json`; pass if `check:configs` is present and `ci:local` includes `pnpm check:configs` before broader lint/type/build/test gates.

## SaaS Business And Operations Test Cases

- Authentication, onboarding, organizations, RBAC, billing, settings, support, and customer lifecycle behavior are not implemented in this module. Pass if config changes do not add runtime auth/billing/customer-data behavior or require live credentials.
- Customer data boundary check: pass if scoped files contain no secrets, sample customer records, tenant IDs, call recordings, transcripts, payment data, or production endpoints. Fail on any real credential or customer data in config files, README examples, or lockfile comments.
- Operational handoff: pass if `packages/eslint-config/README.md` and `packages/typescript-config/README.md` document preset names, consumer dependencies, aliases, and troubleshooting. Fail if an intern cannot identify the preferred import path from the README.
- Quality-gate ownership: pass if PR template expectations still require narrow checks, `pnpm ci:local` for shared/release changes, intentional dependency lockfile updates, and no invented compliance/provider claims.

## Integration And API Test Cases

- Internal API endpoints: none in scope. Pass if no scoped file declares route handlers, server endpoints, webhook handlers, or database access.
- External providers: none directly used. Pass if config packages do not import Stripe, Twilio, Telnyx, LiveKit, AI, S3, email, OAuth, or analytics SDKs.
- Package integration: after `pnpm install --frozen-lockfile`, run `pnpm --filter console lint` and `pnpm --filter web lint`; pass if both resolve `@repo/eslint-config/next-js` through workspace links.
- Lockfile integration: inspect `pnpm-lock.yaml`; pass if console and web link `@repo/eslint-config` and `@repo/typescript-config`, and `eslint-config-next@16.2.9` is resolved consistently. Fail if manifests and lockfile disagree.
- CI integration: inspect `.github/workflows/ci.yml`; pass if CI installs pnpm with `pnpm/action-setup@v4`, installs with `pnpm install --frozen-lockfile`, and runs `pnpm ci:local`.

## Non-Functional Test Cases

- Performance: pass if type-aware ESLint remains opt-in through `@repo/eslint-config/type-checked`; fail if base/Next lint becomes type-aware by default and slows every app lint.
- Reliability: pass if package tests validate exports, version alignment, app consumption, README troubleshooting, and strict gates. Fail if new presets lack tests.
- Compatibility: pass if configs remain ESLint 9 flat-config compatible, TypeScript 5.9 compatible, Node `>=18` compatible, and Next lint dependency stays aligned with app `next` version.
- Data integrity: pass if TypeScript strict/base presets keep `strict: true`, `isolatedModules: true`, and `noUncheckedIndexedAccess: true`. Fail if safety checks are weakened without owner approval.
- Recovery: pass if bad subpath usage is documented as `ERR_PACKAGE_PATH_NOT_EXPORTED` troubleshooting in both READMEs.
- Rate limits/concurrency: not applicable to this module; pass if no scoped file introduces runtime request handling or shared mutable state.

## UX, UI, Accessibility, And Compatibility Testing

- Product UI: no visual UI, forms, tables, dialogs, toasts, routes, or responsive breakpoints are in scope. Block browser, keyboard, screen reader, and mobile checks as not applicable for this config-only module.
- Developer UX: pass if README examples are copy-pasteable for base, Next, React library, type-checked ESLint, and all TypeScript presets.
- Error clarity: pass if README troubleshooting covers `ERR_PACKAGE_PATH_NOT_EXPORTED`, Next version skew, type-aware parser errors, missing `@types/node`, and base versus strict selection.
- Compatibility copy: pass if preferred aliases are clearly distinguished from backwards-compatible aliases. Fail if docs encourage deprecated/internal names over preferred public names.

## Security, Privacy, And Compliance Checks

- Lint enforcement: pass if no `eslint-plugin-only-warn` or `onlyWarn` plugin is present and `turbo/no-undeclared-env-vars` is an error.
- Secrets: pass if scoped files contain no `.env` values, access tokens, API keys, private URLs, or live vendor credentials.
- Dependency security: run `pnpm audit:deps -- --audit-level low` in a full setup; pass if it exits 0 or only reports approved, unexpired suppressions. Block if pnpm registry access is unavailable.
- Compliance claims: pass if scoped package docs make no SOC 2, HIPAA, PCI, GDPR, retention, or audit-log claims. Fail if config docs add unsupported compliance promises.
- License: pass if shared package manifests keep `MIT`, matching the root project license.

## Edge Cases And Failure Modes

- Missing pnpm: block pnpm gates; do not substitute npm because the repo declares `pnpm@9.0.0` and uses `pnpm-lock.yaml`.
- Missing `node_modules`: `node --test packages/eslint-config/test.mjs` fails with `ERR_MODULE_NOT_FOUND` for `@eslint/js`; block until dependencies are installed.
- Export typo: importing a non-exported subpath should fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`; pass if README tells users to use documented subpaths.
- Next version skew: fail if app `next`, app `eslint-config-next`, and shared package `eslint-config-next` are not all `16.2.9`.
- Type-aware parser context: block or fail `type-checked` usage in a workspace without a discoverable `tsconfig.json`; README should warn about this.
- App TypeScript adoption gap: console and web currently declare the shared TypeScript config package but do not extend it. Treat future changes here as owner-review required.

## Test Data, Fixtures, Accounts, And Roles

- No user accounts, tenants, organizations, roles, billing plans, seeded database rows, recordings, transcripts, API keys, or provider sandboxes are required.
- Fixture files are the scoped config and manifest files themselves, especially `packages/*/test.mjs`, both READMEs, app package manifests, root `package.json`, `pnpm-lock.yaml`, and `turbo.json`.
- Required role for testing: repository contributor with local shell access and dependency install permission. No admin console, SaaS tenant admin, support agent, or billing admin role is needed.

## External Services Or Blocked Checks

- Blocked without pnpm 9.x: `pnpm install --frozen-lockfile`, `pnpm check:configs`, package lint scripts, app lint scripts, `pnpm audit:deps`.
- Blocked without npm registry access: dependency install and audit resolution.
- Blocked under strict no-write/read-only constraints: full `pnpm ci:local`, because it includes build/test/Docker/Python steps that may create generated artifacts or require services.
- Not applicable: live telephony, AI services, Stripe, OAuth, email, object storage, database, Redis, webhooks, browser UI, accessibility automation, and production monitoring credentials.

## Regression Risks

- Removing public export aliases breaks existing workspace consumers.
- Reintroducing `onlyWarn` or lowering Turbo env-var severity allows CI to pass with important config mistakes.
- Moving type-aware lint into the default presets can slow or break normal app lint.
- Next/ESLint version skew can produce different lint behavior locally versus CI.
- App package manifests may declare shared TypeScript config without actually extending it, weakening consistency.
- Lockfile drift can make workspace links or dependency versions differ from manifests.
- Removing `check:configs` from `ci:local` allows shared config regressions to bypass CI.
- Changing `turbo.json` `globalEnv` can cause stale cache behavior around `CONTACT_WEBHOOK_URL` or `NODE_ENV`.

## Release Acceptance Checklist

- [ ] `git rev-parse HEAD` matches the target commit or the PR diff is intentionally based on a newer commit.
- [ ] `pnpm install --frozen-lockfile` succeeds with pnpm 9.x and does not rewrite `pnpm-lock.yaml`.
- [ ] `pnpm check:configs` passes.
- [ ] `pnpm --filter console lint` and `pnpm --filter web lint` pass with zero warnings.
- [ ] Shared package exports, README preset tables, app imports, and lockfile links are consistent.
- [ ] `next` and `eslint-config-next` remain aligned at `16.2.9` for console, web, and `@repo/eslint-config`.
- [ ] No scoped file introduces secrets, customer data, live provider dependencies, runtime API behavior, or unsupported compliance claims.
- [ ] Any unresolved blocked check is documented with reason, owner, and exact command to rerun.
