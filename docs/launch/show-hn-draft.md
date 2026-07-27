# Show HN Draft

Primary link: https://github.com/allgpt-co/QuickVoice

Official guidance: https://news.ycombinator.com/showhn.html

## Submission Title

```text
Show HN: QuickVoice - open-source infrastructure for AI phone agents
```

Backup title:

```text
Show HN: QuickVoice, an MIT-licensed stack for self-hosted AI phone agents
```

## First Comment Draft

```text
Hi HN, we are building QuickVoice as an open-source Retell alternative for AI phone agents.

Most voice-agent products are hosted APIs. That can be the right tradeoff when you want the fastest managed endpoint. QuickVoice takes the opposite route for teams that need more control: the repo includes the Next.js website, customer console, Express API, Python/LiveKit worker, Postgres and Redis setup, telephony bindings for Twilio or Telnyx, knowledge bases, call logs, outbound campaigns, billing paths, and local orchestration.

The quick local path is:

task up:dev

That launches the local product surface and services. It does not magically place real phone calls from a fresh clone. Real calls require LiveKit plus Twilio or Telnyx credentials, and billing/OAuth/email/storage each need their own provider credentials.

Why we are posting: we want technical feedback on the architecture, local setup, provider boundaries, and what is missing for teams that want inspectable phone-agent infrastructure instead of a fully closed hosted API. We especially care about whether the self-hosting, privacy, cost, and extensibility tradeoffs are clear from the repo.

We are not claiming production benchmarks, customer metrics, HIPAA/SOC2 status, or that the dashboard image proves usage. The repo is the thing to inspect.
```

## Timing Notes

- Use Show HN as the first technical launch post.
- Post only when a maintainer can answer comments for at least 4 hours.
- Submit the GitHub repo, not a blog post or signup page.
- Add the first comment within 5 minutes.
- Watch the thread closely for the first hour, then every 15 to 30 minutes for the next 3 hours.
- Do not ask friends or followers to upvote or comment.
- If sharing the HN thread elsewhere, ask for feedback on the project, not votes on HN.

## Response Notes

Keep replies short, specific, and technical.

### "Can I try it without signing up?"

```text
Yes for local inspection. Clone the repo and run `task up:dev` after installing the host prerequisites. Real phone calls still need LiveKit plus Twilio or Telnyx credentials.
```

### "Is this production ready?"

```text
The repo is meant to be inspectable and self-hostable. We should not overstate it as a managed production SLA. If you are evaluating it seriously, start with local setup, provider credentials, auth, data retention, and deployment controls.
```

### "How is this different from Retell, Vapi, Bland, etc.?"

```text
The main difference is control. Hosted APIs optimize for speed and convenience. QuickVoice exposes the application, API, worker, storage, logs, and telephony integration points so teams can inspect, self-host, and change them. That matters if your evaluation includes privacy review, provider choice, cost visibility, or custom workflows.
```

### "Does it handle HIPAA / SOC 2 / regulated use?"

```text
Do not treat the repo alone as a compliance claim. Regulated deployments depend on hosting, access controls, audit process, provider agreements, retention policy, and legal review.
```

### "Why MIT?"

```text
MIT keeps adoption simple for self-hosted, commercial, and proprietary deployments. Teams can modify and distribute QuickVoice while retaining the copyright and permission notice.
```

## Follow-Up Comment If Setup Breaks

```text
Thanks for trying it. If `task up:dev` fails before provider credentials are involved, please share the command, OS, Node version, and the first error. We will turn confirmed setup problems into GitHub issues or docs fixes.
```
