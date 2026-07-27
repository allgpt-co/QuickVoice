# Local Postgres And Redis Health Troubleshooting

QuickVoice uses `docker-compose.dev.yml` for local Postgres and Redis. The services bind to localhost and use development-only credentials from `.env.dev.example`.

## Inspect service state

```sh
task env:dev
task docker:up
docker compose -f docker-compose.dev.yml --env-file .env.dev ps
```

Do not print or upload `.env.dev`. If you need to share output, redact paths or values that identify private machines or accounts.

## Postgres recovery path

1. Check whether the service exists and is healthy:

   ```sh
   docker compose -f docker-compose.dev.yml --env-file .env.dev ps postgres
   ```

2. Inspect a short, redacted log window:

   ```sh
   docker compose -f docker-compose.dev.yml --env-file .env.dev logs --tail=80 postgres
   ```

3. If port `5432` is occupied by another local database, stop the other service or change `POSTGRES_PORT` in `.env.dev` before starting QuickVoice.

4. Re-run migrations after Postgres is healthy:

   ```sh
   task db:migrate
   ```

## Redis recovery path

1. Check Redis state:

   ```sh
   docker compose -f docker-compose.dev.yml --env-file .env.dev ps redis
   ```

2. Inspect a short, redacted log window:

   ```sh
   docker compose -f docker-compose.dev.yml --env-file .env.dev logs --tail=80 redis
   ```

3. If port `6379` is occupied, stop the other Redis service or change `REDIS_PORT` and matching service URLs before startup.

## Stop versus reset

Use this first when you only need to stop local dependencies:

```sh
task docker:down
```

`task docker:reset` is destructive. It removes local QuickVoice Postgres, Redis, and optional service volumes:

```sh
task docker:reset
```

Run the reset task only after you have accepted that local development data can be deleted.

Related guides: [WSL2](./windows-wsl2.md), [macOS](./macos.md), and [Mailpit smoke testing](./mailpit-smoke.md).
