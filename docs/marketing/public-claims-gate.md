# Public Claims Gate

QuickVoice launch copy must be traceable to public evidence or framed as a conditional workflow, evaluation question, roadmap item, or illustrative scenario.

This gate applies to the website, README, launch posts, directory listings, screenshots, structured data, demos, sales collateral, and contributor materials. A claim is not approved merely because similar wording already exists in the repository.

## Blocked Until Evidence Exists

Do not publish these as QuickVoice facts without an approved registry entry and a reviewable source:

- customer, user, company, deployment, or call-volume counts;
- customer logos, testimonials, quotes, or case-study outcomes;
- ROI, cost savings, conversion, automation, satisfaction, latency, uptime, accuracy, or reliability metrics;
- HIPAA, SOC 2, ISO 27001, PCI DSS, HITRUST, GDPR, CCPA, TCPA, FDCPA, or other certification and compliance statements;
- BAA, SLA, audit, penetration-test, data-center, or incident-response commitments;
- native integrations, provider partnerships, automatic language detection, or fixed language counts;
- "no setup", "no code", "instant", "unlimited", "never miss", or fixed deployment-time promises;
- competitor superiority, price, latency, quality, or feature claims without a dated comparison source.

## Safe Claim Types

The following are suitable when they match the current code and documentation:

- repository contents and routes that a reviewer can inspect;
- the MIT license, quoting its actual terms and preserving required notices;
- local-development commands and their documented prerequisites;
- provider requirements for LiveKit, Twilio or Telnyx, speech, models, storage, OAuth, billing, and email;
- architecture and data-path descriptions tied to named source files;
- explicit limitations and shared-responsibility boundaries;
- illustrative scenarios that are visibly labeled and never presented as customer proof.

## Evidence Registry Contract

An approved claim record should include:

1. stable claim ID;
2. exact approved wording;
3. classification: code-backed, contract-backed, audited, customer-approved, third-party sourced, conditional, illustrative, roadmap, or prohibited;
4. public source URL or internal evidence owner;
5. scope and exclusions;
6. approver;
7. approval and expiry dates;
8. every public surface using the claim.

Expired claims return to blocked status.

## Automated Audit

Run:

```sh
node scripts/audit-public-claims.mjs
```

For machine-readable output:

```sh
node scripts/audit-public-claims.mjs --json
```

To prove a campaign destination independently of the unresolved legacy-site
backlog, pass one or more repository-relative targets:

```sh
node scripts/audit-public-claims.mjs \
  --target apps/web/src/app/open-source \
  --target apps/web/src/components/open-source
```

`--target` accepts a supported public-content file or directory and may be
repeated. It rejects missing paths and paths outside the repository.

The audit intentionally exits non-zero while potential unsupported claims remain. It is a launch-readiness gate, not a guarantee that all surviving copy is correct.

The automated audit rejects `claims-audit: allow` markers. A marker is not evidence, and this repository has no implemented exception registry. Rewrite flagged copy and record the actual sources and reviewer in the article evidence review. Passing the scan is a preliminary check; factual review is still required.

## Launch Decision

Do not scale directory submissions, paid placement, earned-media outreach, or a flagship launch while this audit is failing on pages that the campaign will send traffic to.

The first launch path should point to the repository or `/open-source`, where claims are limited to inspectable code, documented setup requirements, provider boundaries, and licensing.
