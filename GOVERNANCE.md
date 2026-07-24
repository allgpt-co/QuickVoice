# QuickVoice Governance

QuickVoice uses maintainer-led, contribution-friendly governance. Contributors can propose and implement changes; maintainers remain accountable for what enters the upstream repository and what is presented as a release.

## Principles

- Prefer reproducible evidence over popularity, urgency, or volume of comments.
- Keep provider, privacy, security, deployment, and compliance boundaries explicit.
- Make the smallest decision that unblocks useful work.
- Do not ask contributors to race each other.
- Treat backwards compatibility as increasingly important as releases mature.
- Separate commercial arrangements from technical acceptance of an open-source contribution.

## Decision Process

1. **Small and reversible changes:** the assigned maintainer decides through normal issue and pull-request review.
2. **Cross-cutting or difficult-to-reverse changes:** open an issue or design discussion before implementation. This includes auth, billing, database schema, public APIs, telephony, runtime workers, security controls, licensing, deployment architecture, and new required dependencies.
3. **Security-sensitive changes:** use private coordination when public discussion would expose a vulnerability.
4. **Release decisions:** the release approver confirms the release checklist, known limitations, and final notes before a tag or GitHub release is created.

Maintainers should explain a rejection or requested redesign with specific technical, scope, safety, maintenance, or roadmap reasons. Consensus is preferred. When consensus is not available, the repository lead makes the final decision and records the outcome in the relevant issue or pull request when it is safe to do so.

## Contributor Coordination

The assignment and duplicate-work policy in [CONTRIBUTING.md](./CONTRIBUTING.md) applies to community work:

- Search before proposing.
- Obtain assignment for non-trivial work.
- Keep one pull request focused on one agreed outcome.
- Do not open parallel implementations unless a maintainer requests alternatives.
- Do not submit automated issue floods or unrelated generated changes.

Starter briefs in `docs/community/starter-issues.md` are not assignments. A maintainer must create or approve a GitHub issue before work begins.

## Changes That Require Explicit Approval

The repository lead must approve:

- A tagged release or change to the release/versioning policy.
- A maintainer appointment or removal.
- A license or contributor-licensing change.
- A new production deployment target or privileged workflow.
- A material security-default or data-retention change.
- A public compatibility, performance, reliability, cost, customer, partnership, or compliance claim.

## Appeals

If a contributor disagrees with a review decision, they should summarize the disputed point and new evidence in the same issue or pull request. The repository lead makes the final upstream decision. The AGPL license continues to permit forks under its terms; upstream maintainers are not required to merge every valid alternative.

## Amendments

Governance changes use a normal pull request but require repository-lead approval. The pull request should explain why the change is needed and how it affects contributors, maintainers, and existing work.
