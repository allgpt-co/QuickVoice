# QuickVoice Roadmap

QuickVoice is an actively developed, pre-stable open-source project. This roadmap communicates direction; it is not a delivery promise, service-level agreement, or guarantee that a proposed feature will ship.

## How To Read This Roadmap

- **Release baseline** means work needed before maintainers should consider the first public versioned release.
- **Next** means a likely priority after the baseline is repeatable.
- **Later** means strategically useful work that needs design, contributor capacity, or stronger operational evidence.
- A roadmap item becomes actionable only when it has a scoped GitHub issue with an owner and acceptance criteria.

Priorities may change in response to security findings, setup failures, maintainer capacity, and real user feedback. Propose or discuss roadmap changes through the feature issue form rather than opening a broad implementation pull request.

## Release Baseline

- Make a clean-clone local setup repeatable on Linux, macOS with modern Bash, and WSL2.
- Keep environment templates safe, complete, and explicit about which integrations need live provider credentials.
- Maintain required checks for linting, types, builds, tests, dependency audits, and backend images.
- Publish clear governance, support, security, contributor, release, and known-limit documentation.
- Validate the console, API, AI API, Postgres, and Redis startup path without claiming that placeholder credentials exercise provider-backed features.
- Define a reproducible release checklist and complete the v0.1.0 checklist before creating any tag.

## Next

- Reduce time-to-first-local-success with better diagnostic output and credential-free smoke tests.
- Expand deployment documentation for operators who will supply their own secrets, domains, storage, observability, and rollback process.
- Improve API and integration examples while keeping carrier, LiveKit, model, and storage dependencies explicit.
- Strengthen contributor automation for documentation links, issue-form schemas, environment-template drift, and release metadata.
- Add public, reproducible performance and reliability measurements before making latency, scale, or cost claims.
- Grow tests around organization isolation, call-data retention, tool execution, provider failure modes, and upgrade safety.

## Later

- Evaluate additional telephony, speech, model, storage, and vector providers through stable adapter boundaries.
- Improve operational observability, capacity guidance, backup/restore guidance, and incident-response documentation.
- Document supported upgrade paths once release-to-release compatibility has real evidence.
- Develop reusable, consent-aware example agents and integrations that can run without private customer data.
- Consider maintained deployment recipes only where the project can test and support their assumptions.

## Explicit Non-Claims

The roadmap does not mean QuickVoice currently provides:

- A zero-configuration hosted phone-agent service.
- Working live calls without provider accounts and credentials.
- A compliance certification or automatic compliance for a deployment.
- Guaranteed compatibility before a stable release.
- Guaranteed response, fix, or delivery times.
- Support for native Windows PowerShell orchestration.

See [SUPPORT.md](./SUPPORT.md) for help boundaries, [GOVERNANCE.md](./GOVERNANCE.md) for decisions, and [CHANGELOG.md](./CHANGELOG.md) for changes that have actually landed.
