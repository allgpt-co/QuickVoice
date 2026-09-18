# Marketing website deployment

The production website is the existing Coolify application
`76d9ooqtvm1hl9tbzmza3few`, serving `https://quickvoice.co` from this
repository's `main` branch. Its environment and build configuration remain in
Coolify.

When a merged website release has not appeared, run **Deploy QuickVoice
Website** in GitHub Actions on `main`:

```sh
gh workflow run deploy-web.yml --ref main
```

The manual workflow uses the existing `COOLIFY_API_URL` repository variable
(`https://webhook.quickintell.com/api/v1`) and `COOLIFY_API_TOKEN` repository
secret. It requires completed quality and dependency-security checks for the
exact current main commit. It does not deploy the backend, console, or docs.

The helper validates the application identity before requesting deployment,
avoids adding another deployment while a different revision is active, and
checks the deployment UUID, final commit, and application health. Credentials
and raw API responses are not written to logs.

If a deployment request times out or returns an error, the helper reconciles
the application queue once using GET requests. It does not repeat the POST.
Inspect Coolify before retrying an ambiguous or unfinished request.

A successful workflow confirms the deployment and application health. Verify
the public homepage and changed routes afterward; GitHub merge status alone
does not establish that a release is live.

## SEO activation controls

The optional `contact_attribution` and `manual_pageviews` inputs accept
`preserve` (default), `enable`, or `disable`. They change only the corresponding
production flags, verify their saved value and build/runtime scope, then deploy.
Enabling requires `prerequisites_verified=true`: record healthy compatible API
delivery before contact activation, and GA stream history-pageview disablement
before manual-pageview activation. GA preparation remains an operator attestation. Contact activation also requires
`compatible_api_commit`, the full previously released API revision. The helper
checks the established receiver's image tag, healthy status and finished latest
deployment, then compares the production webhook endpoint and shared secret in
memory before changing flags. It prints no environment values. Use the SEO
runbooks for the separate delivery and GA checks.

The helper refuses flag changes while any deployment is active, including the
same revision. It preserves preview and unrelated environment variables and
never logs raw environment responses. An uncertain environment write is not
retried; inspect the saved flags before another attempt. A failure after a saved
flag change can require reconciliation even if no deployment was queued.

Disable contact attribution before reverting the receiver. For pageview
rollback, deploy `manual_pageviews=disable` before restoring GA history tracking.
