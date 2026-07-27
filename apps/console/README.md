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

## API Connectivity And CORS Diagnostics

Start with the API health route before debugging the console UI:

```sh
task server:dev
pnpm smoke:api
```

The console reads `NEXT_PUBLIC_SERVER_URL` from `apps/console/.env.local`, which `task env:dev` creates from `apps/console/.env.dev.example`. Restart `task console:dev` after changing `.env.local`; Next.js only exposes `NEXT_PUBLIC_*` values that were present when the dev server started.

Default local ports are console `3000` and API `5000`. A browser CORS or network error usually means one of these is true:

- the API server is not running or not healthy;
- `NEXT_PUBLIC_SERVER_URL` points at the wrong host or port;
- the API CORS allowlist does not include the console origin;
- authentication failed after the browser successfully reached the API.

Do not disable browser security or broaden CORS as a workaround. Share redacted Network panel evidence only: method, path, status code, and the first error line. Do not share cookies, authorization headers, full HAR files, signed URLs, or customer data.

## Checks

Run package-specific checks from the repository root:

```sh
pnpm --filter console lint
pnpm --filter console check-types
pnpm --filter console build
pnpm --filter console test
```

Use the root `pnpm test` or `pnpm ci:local` when a console change also affects shared configuration or API contracts.

## Learn More

- [Repository overview](../../README.md)
- [Contribution workflow](../../CONTRIBUTING.md)
- [Next.js documentation](https://nextjs.org/docs)
