# QuickVoice Console

`apps/console` is the Next.js customer console for configuring organizations, agents, phone numbers, calls, knowledge bases, tools, API keys, billing, and settings. It is one part of the QuickVoice monorepo; it is not a standalone hosted product.

## Getting Started

The supported full-stack path starts at the repository root:

```sh
task doctor
task up:dev
```

This prepares `apps/console/.env.local` from the tracked `.env.dev.example`, starts the API and local dependencies, applies migrations, and serves the console at [http://localhost:3000](http://localhost:3000).

To run only the console after dependencies and the API are already available:

```sh
task env:dev
pnpm install --frozen-lockfile
task console:dev
```

The console expects the API at the URL configured by `NEXT_PUBLIC_SERVER_URL` (the development template uses `http://localhost:5000`). Starting the console alone does not start Postgres, Redis, the API server, or the AI worker.

## Requirements And Boundaries

- Node.js `^20.19 || ^22.13 || >=24` and `pnpm@9.0.0`
- A Linux environment with Bash `>=4`; use WSL2 on Windows
- The root API and its local data services for authenticated product flows
- External credentials for OAuth, billing, LiveKit, telephony, storage, email delivery, and model-provider actions

Placeholder values in `.env.dev.example` are safe development markers, not working provider accounts. Do not add real credentials to tracked files or public bug reports. See the root [setup boundaries](../../README.md#setup-boundaries) and [support policy](../../SUPPORT.md).

## Checks

Run package-specific checks from the repository root:

```sh
pnpm --filter console lint
pnpm --filter console check-types
pnpm --filter console build
node --test apps/console/tests/*.test.mjs
```

Use the root `pnpm test` or `pnpm ci:local` when a console change also affects shared configuration or API contracts.

## Learn More

- [Repository overview](../../README.md)
- [Contribution workflow](../../CONTRIBUTING.md)
- [Next.js documentation](https://nextjs.org/docs)
