# QuickVoice Maintainers

This file names the people currently accountable for repository decisions. Git history alone does not grant maintainer status.

## Current Maintainer

| GitHub account                             | Role                                 | Responsibilities                                                                                                           |
| ------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| [@rahuliitk](https://github.com/rahuliitk) | Repository lead and release approver | Final repository decisions, maintainer appointments, security coordination, release approval, and fallback code ownership. |

QuickVoice currently has a small formal maintainer group. That is a bus-factor risk, not a claim that every decision receives single-person review. Sensitive changes should receive an additional qualified review when one is available.

## Maintainer Responsibilities

Maintainers are expected to:

- Triage issues and prevent duplicate contributor work.
- Review changes for correctness, scope, security, privacy, licensing, and evidence-safe public claims.
- Keep required checks meaningful and document any intentionally skipped release gate.
- Handle security reports privately under [SECURITY.md](./SECURITY.md).
- Keep [CHANGELOG.md](./CHANGELOG.md), [ROADMAP.md](./ROADMAP.md), support boundaries, and release notes current.
- Recuse themselves when a conflict of interest would make an impartial decision difficult.
- Apply the [Code of Conduct](./CODE_OF_CONDUCT.md) consistently.

## Becoming A Maintainer

Maintainer access is earned through sustained, reviewable contributions and good project judgment. Signals include:

- Several merged contributions across more than one area.
- Reliable review and issue-triage work.
- Respect for security, privacy, licensing, and provider boundaries.
- Clear communication and willingness to maintain changes after merge.
- Agreement from the repository lead and acceptance by the candidate.

An appointment should be recorded in a pull request updating this file and `.github/CODEOWNERS`. Repository permissions are granted separately by an organization administrator; a documentation change alone does not grant access.

## Inactivity And Removal

A maintainer may step down at any time. Maintainers who expect to be unavailable should say so and transfer active release or security work. Removal for inactivity, conduct, security, or trust reasons is decided by the repository lead and documented publicly when doing so would not expose private security or conduct information.

## Ownership

`.github/CODEOWNERS` defines requested review ownership. It does not bypass branch protection, required checks, or the decision process in [GOVERNANCE.md](./GOVERNANCE.md).
