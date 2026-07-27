# Reddit Draft

Primary link: https://github.com/allgpt-co/QuickVoice

Official guidance to recheck: https://support.reddithelp.com/hc/en-us/articles/28012014962580-How-do-I-keep-spam-out-of-my-community

## Posting Rule

Post in one relevant community first. Do not blast the same launch into many subreddits. Read the subreddit rules, search recent posts, and skip any community where self-promotion or launch posts are unwelcome.

Use a text post if the community prefers context over link drops. Disclose that QuickVoice is our project in the first paragraph.

## Candidate Angles

- Self-hosting angle: teams that want to run the voice-agent stack themselves.
- Open-source angle: MIT-licensed repo with app, API, worker, and telephony integrations.
- Programming angle: architecture and local development path for an AI phone-agent monorepo.
- Voice AI angle: open-source Retell alternative for teams that want inspectable infrastructure.

## Title Drafts

```text
I am working on an MIT-licensed self-hostable stack for AI phone agents
```

```text
QuickVoice: open-source infrastructure for AI phone agents with LiveKit, Twilio/Telnyx, Postgres, and Redis
```

```text
Looking for feedback on a self-hostable AI phone-agent stack
```

## Body Draft

```text
Maintainer disclosure: QuickVoice is our project.

We are building it as an open-source, self-hostable stack for AI phone agents. The repo includes the public web app, customer console, Express API, Python/LiveKit worker, Postgres and Redis setup, Twilio/Telnyx telephony integration points, knowledge bases, call logs, outbound campaigns, billing paths, and local development tooling.

The reason we are sharing it here: most AI phone-agent tools are closed hosted APIs. That is convenient, and it may be the right choice if you only need a managed endpoint. QuickVoice is meant for teams that would rather own more of the stack: runtime behavior, call metadata, storage, provider boundaries, deployment tradeoffs, privacy review, and cost structure.

Local path:

task up:dev

What that gets you: local services and the product surface.

What it does not get you from a fresh clone: real phone calls. For that you still need LiveKit plus Twilio or Telnyx credentials. OAuth, billing, outbound email, and object storage also need provider credentials.

GitHub: https://github.com/allgpt-co/QuickVoice
Website: https://quickvoice.co

Useful feedback would be:

- Does the README explain the stack quickly enough?
- Are the provider boundaries clear?
- What would block you from self-hosting something like this?
- Is the control-versus-convenience positioning useful, or too broad?
- Which integration or deployment docs would you expect first?

Not claiming customer metrics, benchmarks, production compliance, or that the screenshot proves usage. The repo is the thing to inspect.
```

## Subreddit-Specific Edits

For a self-hosting community:

```text
I am especially interested in whether the local setup and provider boundary notes are honest enough for self-hosters. A fresh clone can run local services, but real calls still need external voice and telephony providers.
```

For an open-source community:

```text
The license is MIT. I would like feedback on whether the contribution docs and issue flow are clear enough for people who want to inspect or extend the stack.
```

For a programming community:

```text
The architecture spans Next.js, Express, Python LiveKit workers, Prisma/Postgres, Redis, and provider webhooks. I am looking for feedback on whether the boundaries are understandable from the repo docs.
```

## Timing Notes

- Post after the Show HN thread is live and initial comments are covered.
- Use H+45 to H+90 as the first Reddit window.
- Post to one community. Wait for signal before considering a second.
- If a post is removed, do not repost the same thing. Check rules and use modmail only if the rule fit is genuinely unclear.
- Answer comments for the first 2 hours, then check every 30 to 60 minutes during the launch day.

## Response Notes

- Start with the answer, then add context.
- Do not argue with people who dislike self-promotion.
- If someone challenges the claim, narrow the claim.
- If someone reports setup friction, ask for OS, command, and first error.
- If someone asks for a feature, say whether it exists, is planned, or is not decided.

Useful reply:

```text
That is a fair concern. The current repo gives you the app/API/worker/local data path, but real calls still depend on LiveKit plus a telephony provider. We are trying to make that boundary explicit rather than pretending a clone is a full carrier-connected deployment.
```
