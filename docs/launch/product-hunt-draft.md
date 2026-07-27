# Product Hunt Draft

Primary link: Product Hunt page once live.

Repo link to include in maker comment: https://github.com/allgpt-co/QuickVoice

Official guidance to recheck:

- https://help.producthunt.com/en/articles/2690626-how-do-i-share-my-post
- https://help.producthunt.com/en/articles/11751186-product-of-the-day-week-month

## Product Page Copy

### Name

```text
QuickVoice
```

### Tagline

```text
Open-source Retell alternative for AI phone agents
```

### Short Description

```text
Run, inspect, and extend a self-hostable voice-agent stack: console, API, LiveKit worker, telephony integrations, knowledge bases, call logs, campaigns, billing paths, and local dev tooling.
```

### Topics

Use whichever current Product Hunt topics fit at submission time. Likely candidates:

- Artificial Intelligence
- Open Source
- Developer Tools
- Productivity
- SaaS

## Maker Comment

```text
Hi Product Hunt, we are launching QuickVoice as an open-source Retell alternative for AI phone agents.

The short version: most voice-agent platforms are closed hosted APIs. That is convenient, but it limits how much teams can inspect, self-host, customize, and reason about privacy or provider costs. QuickVoice puts the app, console, API, LiveKit-powered worker, database path, telephony integration points, knowledge bases, call logs, outbound campaigns, billing paths, and local orchestration in one MIT-licensed repo.

GitHub: https://github.com/allgpt-co/QuickVoice

Local path:

task up:dev

Clear boundary: a fresh clone can run the local product surface, but real phone calls require LiveKit plus Twilio or Telnyx credentials. OAuth, billing, email, and storage also require their provider keys.

We are looking for feedback from people building or evaluating AI phone-agent infrastructure:

- Is the project clear within the first minute?
- What would block you from self-hosting it?
- Are the control, privacy, cost, and extensibility tradeoffs clear?
- Which provider docs should be deeper?
- What is missing from the console/API/worker split?

We are not claiming customer metrics, benchmarks, or production compliance status. The repo is public so the technical parts can be inspected directly.
```

## Gallery Notes

Use only real assets from the repo or fresh captures from a local run with demo data.

- README/dashboard image if it still matches the current console.
- Architecture diagram from the README if Product Hunt accepts it as an image.
- No invented logos for customers.
- No fake charts, fake call volume, fake revenue, or fake accuracy numbers.
- No compliance badges unless they are actually earned and approved.

## Share Copy

```text
QuickVoice is live on Product Hunt today.

It is an MIT-licensed stack for AI phone agents that you can inspect, self-host, and extend: console, API, LiveKit worker, telephony integration points, knowledge bases, call logs, campaigns, and local dev tooling.

[PRODUCT_HUNT_URL]
```

## Timing Notes

- Use Product Hunt only when a maintainer can answer comments during the full launch day.
- Publish the maker comment immediately after the page is live.
- Share the page organically on X / Twitter and with communities where QuickVoice is already relevant.
- Do not mass-message people asking for votes.
- Do not offer incentives for upvotes.
- Do not coordinate voting groups.
- Keep the GitHub repo visible in the maker comment so technical visitors can inspect source immediately.

## Response Notes

- Thank people for concrete feedback, not just praise.
- Answer technical questions with the GitHub repo, README sections, or issue links.
- Be direct about provider requirements.
- Keep feature requests grounded: "exists", "not yet", or "not decided".
- If someone asks whether QuickVoice is a hosted service, explain that the repo is self-hostable and commercial/managed terms are separate.
- If someone compares QuickVoice to Retell or another hosted platform, explain the control-versus-convenience tradeoff without making performance or quality claims.

Useful reply:

```text
Thanks for checking it out. The open-source repo is built for inspection and self-hosting. Real calls require LiveKit plus Twilio or Telnyx credentials, so the fastest useful evaluation is usually local setup first, then provider configuration once the architecture looks right for your use case.
```
