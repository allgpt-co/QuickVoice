# MCP deployment and emergency recovery

Normal main deployments wait for CI's Quality Summary, including the MCP server's
lint/types, build and transport tests. The reusable MCP deployment workflow also
runs MCP lint/types, build and transport tests at the exact requested commit,
plus the dependency audit, before publishing an image or triggering Coolify.

## Emergency bypass of unrelated CI failures

Use this only when a documented incident requires deploying MCP while an unrelated
Quality Summary job is failing. It does not bypass MCP validation or dependency
advisories. Do not weaken those gates to work around an unrelated failure.

Prerequisites maintained by a repository administrator:

- Protect the `production-mcp-server` GitHub environment with required reviewers,
  prevent self-review, and restrict deployment branches to `main`.
- Configure AWS/Coolify variables and move `COOLIFY_API_TOKEN` into the protected production environments; remove the repository-level token only after both normal and emergency jobs can access their environment secrets.
- Set `PRODUCTION_ENVIRONMENTS_PROTECTED=true` only after configuring protections.
  This variable is an operator assertion; it does not create GitHub protections.

Steps:

1. Identify the full 40-character commit SHA already merged into `main`. Record
   the current production image tag for rollback.
2. Open Actions → **Emergency MCP Deploy** → **Run workflow**, selecting `main`.
3. Enter the SHA, an incident/ticket URL and explanation, and explicitly confirm
   the Quality Summary bypass. Non-main and unmerged sources are rejected.
4. Check the request summary. MCP validation and the dependency audit must pass.
5. When required reviewers are configured, an independent reviewer approves the pending `production-mcp-server` deployment. The workflow cannot create those repository settings.
   Approve any subsequent protected deployment job after inspecting its image SHA.
6. Confirm the Coolify container is healthy and test an authenticated MCP
   initialize/list-tools request and one harmless read tool against production.
   A successful Coolify trigger alone does not prove the service is healthy.
7. Record the workflow run, SHA and verification result in the incident. Repair
   the unrelated CI failure and return to normal deployments.

To roll back, repeat with a known-good SHA merged into main. It is rebuilt and
must pass the same validation and audit. No arbitrary image or failed MCP build
can be deployed through this bypass. Normal and emergency MCP deploys share the
same concurrency group to prevent overlapping deployment runs.

## Stable Inngest registration URL

On **quickvoice-server** in Coolify, configure:

```env
SERVER_URL=https://api.quickvoice.co
INNGEST_SERVE_ORIGIN=https://api.quickvoice.co
INNGEST_SERVE_PATH=/api/inngest
```

The explicit Inngest origin takes precedence; the legacy `INNGEST_SERVE_HOST`
remains a fallback, followed by the existing canonical server URL (`SERVER_URL`,
then `BETTER_AUTH_URL`, then localhost for development). Request Host and
X-Forwarded-Proto headers do not determine the registered origin.

For self-hosted Inngest using private networking, explicitly set an HTTP(S)
origin reachable by that Inngest instance instead. The path override is only
needed if a reverse proxy exposes the handler at a different external path;
the Express handler remains mounted at `/api/inngest`.

Redeploy the server, sync the app in Inngest, and verify the registered endpoint
and one function execution. Keep proxy trust enabled for correct client IP
handling. No production environment or Inngest registration is changed by
editing these repository files alone.

## Retry a normal deployment after CI failure

Run **CI → Run workflow → main** after repairing the checks. The deploy jobs are
native dependencies of Quality Summary; there is no 15-minute polling gate and
no bypass of unfinished tests. Backend and MCP changes are compared with the last
successful matching deployment job on main (not the previous push). If no such
run is found in the last 100 successful CI runs, all relevant files are considered
changed. GitHub API errors fail closed. No deployment workflow is started by these
repository edits.

The marketing deploy script requires Coolify `git_commit_sha=HEAD` and does not
pin or PATCH it. An existing stale pin must be reset to HEAD by an operator before
running that script. It verifies the resulting deployment's commit and health.

### Pending repository protection setup

The concrete proposed environment settings are in
`.github/production-environment-protection.json`: approval by one of the three
listed human administrators, no self-approval, and deployment from `main` only.
These settings are a proposal until an administrator applies and verifies them.
Apply `environmentSettings` to each listed environment, then create/verify its
`branchPolicy`. Remove any other branch/tag deployment policies. Enter
`COOLIFY_API_TOKEN` separately in each environment listed under `secretMigration`;
GitHub does not permit reading an existing secret back. Only then remove the
repository-scoped token and enable `PRODUCTION_ENVIRONMENTS_PROTECTED`.

Backend and MCP deploys now wait for the specific Coolify deployment to finish
and for the application to become healthy with the expected image tag. A failed,
cancelled, mismatched or timed-out rollout fails CI's deploy job and cannot become
the next successful deployment baseline. Manual recovery must use the verified
workflow on `main`; a successful trigger response alone is insufficient.
