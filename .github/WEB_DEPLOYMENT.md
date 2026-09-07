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
