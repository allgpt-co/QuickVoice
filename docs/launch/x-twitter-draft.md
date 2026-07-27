# X / Twitter Draft

Primary link: https://github.com/allgpt-co/QuickVoice

Use this channel to create a clear technical trail that points people to the repo and the live discussion. Do not turn it into a vote request.

## Launch Post

```text
We are launching QuickVoice today.

It is an MIT-licensed, self-hostable Retell alternative for AI phone agents:

- Next.js web app and console
- Express API
- Python + LiveKit worker
- Postgres, Redis, Prisma
- Twilio/Telnyx integration points
- knowledge bases, call logs, campaigns, billing paths

Repo:
https://github.com/allgpt-co/QuickVoice
```

## Technical Thread

Post as a thread after the first launch post has a live link.

```text
1/ QuickVoice exists because many AI voice-agent products are closed hosted APIs.

That is useful when you just want a managed endpoint. It is frustrating when you need to inspect call metadata, storage, runtime config, provider boundaries, deployment behavior, privacy posture, or cost structure.
```

```text
2/ The repo is the product surface plus the backend pieces:

- marketing site
- customer console
- API server
- LiveKit-powered AI worker
- Postgres/Redis
- telephony provider bindings
- knowledge bases
- call logs
- outbound campaigns
- billing paths
```

```text
3/ Local path:

task up:dev

That launches the local services and product surface.

Real calls still need real LiveKit plus Twilio or Telnyx credentials. OAuth, billing, email, and storage also need their own provider keys.
```

```text
4/ The launch ask is technical feedback:

- Is the README clear in 30 seconds?
- Does local setup work?
- Are provider and cost boundaries obvious?
- What docs are missing for self-hosting?
- Which integration should be tightened first?
```

```text
5/ Repo:
https://github.com/allgpt-co/QuickVoice

If you try it and hit setup friction, please open an issue with your OS, command, and first error.
```

## Short Follow-Up Variants

```text
QuickVoice is not a hosted voice-agent API wrapper. It is an open-source Retell alternative with the app, console, API, worker, database path, and telephony integration points in one MIT-licensed repo.

Local eval starts with `task up:dev`.

https://github.com/allgpt-co/QuickVoice
```

```text
One launch-day clarification for QuickVoice:

`task up:dev` gets the local product surface running.

Real phone calls still need LiveKit plus Twilio or Telnyx credentials. We would rather make that boundary obvious than hide it in launch copy.
```

## Timing Notes

- Publish the first post 10 to 20 minutes after Show HN is live.
- Publish the technical thread 1 to 2 hours later, when comments have revealed which details people care about.
- Pin the main launch post for the launch window.
- On day 2, post one recap only if there is real substance: setup fixes, useful feedback, or a newly opened issue.

## Response Notes

- Reply to technical questions with concrete files, commands, or docs.
- Move setup failures to GitHub issues once details are available.
- Do not ask people to star the repo.
- Do not quote-post criticism unless the reply adds useful technical context.
- Do not turn Retell or other hosted-platform comparisons into dunking. Keep the frame on tradeoffs.
- Do not claim compliance, customer usage, or benchmarks unless there is public evidence.

Useful reply:

```text
Good question. The local setup is meant for inspection and development. Carrier-connected calls need LiveKit plus Twilio or Telnyx credentials, and a real deployment needs decisions around auth, secrets, retention, and provider agreements.
```
