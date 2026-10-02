# API rate limiting deployment

Normal API quotas are selected after verifying identity, before JSON parsing:

| Caller | Quota | Counter key |
| --- | --- | --- |
| Verified browser session | 300/minute | Server-verified user ID, across sessions and organizations |
| Verified organization API key | 300/minute | Server-verified key ID |
| Verified AI callback on the existing callback allowlist | 1,000/minute | Worker IP |
| Anonymous or invalid credentials | 1,000/minute | Client IP |

Verified dashboard users do not consume the anonymous IP quota. User/organization
headers cannot select a user quota. Route authentication and authorization still
run; verified identity is reused to avoid duplicate lookups. Better Auth endpoints
retain their own existing authentication limits. Stripe wallet webhooks and the
authenticated runtime handshake retain their existing mounting order.
API keys also retain any existing Better Auth per-key quotas; 300/minute is the
additional API allowance, not an override of those key-specific restrictions.

GET/HEAD health and readiness probes do not consume any API quota. Knowledge-base
polling and live-call reconciliation requests consume the current user's quota.
An exhausted quota responds with 429 and Retry-After; CORS exposes that header.

## Production deployment

Deploy both server and console. No database migration or new package is needed.

1. Confirm all API replicas use the same existing Redis instance and logical DB:

   ```dotenv
   RATE_LIMIT_STORE=redis
   REDIS_URL=redis://YOUR_INTERNAL_REDIS_HOST:6379
   ```

   Keep the real existing credentials/TLS settings. REDIS_URL automatically
   selects Redis when RATE_LIMIT_STORE is unset. Redis operations are atomic and
   blocked requests do not extend expiry. Counter keys are under
   `quickvoice:rate-limit:v2:` and are separate for each quota type.

   Redis errors return 503 rather than resetting to independent counters. The
   dedicated connection has a one-second command timeout and no offline queue.
   Verify Redis availability before switching traffic. Production without Redis
   must explicitly use `RATE_LIMIT_STORE=memory`; that supports one process only,
   and counters reset when the process restarts.

2. Configure `TRUSTED_PROXY_CIDRS` with the actual trusted proxy IPs or CIDRs,
   separated by commas. Empty means direct access and ignores forwarded IPs.
   Boolean trust, hop counts and /0 networks are rejected.

   Inspect the API container's network and the Coolify/Traefik proxy address:

   ```sh
   docker inspect --format '{{json .NetworkSettings.Networks}}' YOUR_API_CONTAINER
   docker inspect --format '{{json .NetworkSettings.Networks}}' coolify-proxy
   ```

   Prefer a stable, tightly scoped proxy address/network. Do not trust every
   Docker private range or an arbitrary caller-controlled X-Forwarded-For value.
   For Cloudflare -> Traefik -> API, configure Traefik to accept upstream
   forwarded headers only from Cloudflare's current published ranges. Include
   the trusted hops Express must traverse in TRUSTED_PROXY_CIDRS, based on the
   resulting chain. Express stops at the nearest untrusted hop. Restrict direct
   access to the origin/API port so callers cannot bypass trusted ingress.

   This repository cannot infer the production proxy chain or configure external
   firewall/Traefik rules. Verify those on the deployment host. Do not copy sample
   IPs from documentation as production addresses.

3. Rebuild and redeploy the server, then the console. Inspect response headers:
   an authenticated dashboard request should show `RateLimit-Limit: 300`.
   Check Redis connection errors and that normal requests do not return 503.

4. Test two accounts from the same public IP. Exhaust account A's quota in a
   staging environment and confirm account B, health checks, and verified AI
   callbacks still work. Rotating A's session or active organization must not
   reset A's quota. Verify separate outside client IPs are seen correctly through
   the proxy for anonymous traffic; do not run load tests against live calls.

## Console behavior

The API client reads Retry-After in seconds or HTTP-date form. It uses a one-minute
fallback if the header is absent, invalid, or already expired. During the browser
tab's cooldown, polling and manual API actions fail locally without sending more
HTTP requests. Mutations are never queued or automatically replayed. Queries can
retry once after the deadline; window-focus refetching is disabled. Existing
polling and query invalidation remain active, subject to the same cooldown.

The cooldown is local to the browser tab. Server quotas remain shared across
tabs, sessions, replicas and restarts when Redis is enabled. Rates still apply to
excessive traffic; this change isolates ordinary users rather than disabling 429.

## Checks

```sh
pnpm --filter server exec tsx --test tests/security/internal-rate-limit.test.ts tests/security/trusted-proxies.test.ts
TEST_RATE_LIMIT_REDIS_URL=redis://127.0.0.1:6379 pnpm --filter server exec tsx --test tests/security/rate-limit-store.test.ts
node --test apps/console/tests/rate-limit-retry.test.mjs
```

Use a disposable Redis instance for tests. The integration test deletes only its
unique test keys; CI provides an isolated Redis service. The tests cover verified
identities, independent quotas, forwarded-header spoofing, Redis concurrency and
expiry, store failure, and client cooldown/retry behavior.

References: [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/),
[express-rate-limit configuration](https://express-rate-limit.mintlify.app/reference/configuration).
