# Launchpad Playbook

This playbook coordinates a 24-to-48-hour launch window for QuickVoice.

The goal is concentrated, qualified GitHub traffic from people who can inspect the repo, run the local stack, ask good questions, and decide whether the project is worth following. GitHub Trending is opaque, so do not treat this as a voting hack. Treat it as a short window where the repo, maintainers, and launch copy all point at the same honest story.

## Launch Principle

Say what is real:

- QuickVoice is an MIT-licensed, self-hostable stack for AI phone agents.
- QuickVoice is positioned as the open-source Retell alternative for teams that want control over the voice-agent stack.
- The repo includes the website, console, API, AI/LiveKit worker, Postgres/Redis setup, telephony bindings, knowledge bases, call logs, campaigns, billing paths, and local orchestration.
- The core tradeoff is control versus convenience: self-hosting, privacy review, provider choice, cost visibility, and extensibility versus a fully managed hosted API.
- `task up:dev` is the local evaluation path.
- Real phone calls require LiveKit plus Twilio or Telnyx credentials.
- OAuth, billing, outbound email, and object storage require their provider credentials.
- The dashboard image is a product UI preview, not proof of revenue, customers, or performance.

Do not say:

- "Production proven", unless there is public evidence.
- "HIPAA compliant", "SOC 2 ready", or similar compliance claims without a documented product decision and supporting evidence.
- "No setup", because local setup still needs host tools and provider credentials for real calls.
- "Better than Retell", "faster than Retell", or similar competitor claims without public evidence.
- "Please upvote", "please star", or anything that asks for coordinated platform voting.

## Star Clipper

Use stars as a passive momentum signal, not a campaign mechanic.

- Keep the star CTA in owned docs such as the README, where visitors are already evaluating the repo.
- Do not add star prompts to the web product, console, signup, API responses, CLIs, or runtime setup flows.
- Do not ask for stars in Show HN, Reddit, Product Hunt comments, X / Twitter replies, or direct messages.
- Treat stars alongside better signals: setup issues opened, provider questions answered, docs gaps found, and people who return with useful feedback.
- If someone says the repo helped them, it is fine to point them to GitHub stars as an optional way to follow the project.

## Source Links To Recheck

Recheck these before launch day because platform rules can change:

- Hacker News Show HN guidelines: https://news.ycombinator.com/showhn.html
- Product Hunt sharing guidance: https://help.producthunt.com/en/articles/2690626-how-do-i-share-my-post
- Product Hunt award and points guidance: https://help.producthunt.com/en/articles/11751186-product-of-the-day-week-month
- Reddit spam and self-promotion guidance: https://support.reddithelp.com/hc/en-us/articles/28012014962580-How-do-I-keep-spam-out-of-my-community

## Ready Checklist

Complete this before the first public post:

- README top section explains what QuickVoice is in under 30 seconds.
- README includes a passive star CTA and Star History link without fabricated counts or launch-pressure copy.
- `task up:dev` has been run on a fresh-ish machine or clean checkout.
- The dashboard image in the README is current enough to not confuse visitors.
- The GitHub repo description and homepage are correct.
- Issues are open and labeled enough for bugs, setup problems, and docs gaps.
- `CONTRIBUTING.md` and `SECURITY.md` are present and accurate.
- Launch responders have read [Launch Day Triage](./launch-day-triage.md), including good-first-issue criteria and first-response expectations.
- The launch owner can answer comments for the first 4 hours.
- A second responder can watch GitHub issues and setup failures.
- A private notes doc or issue tracks repeated questions and broken instructions.

## 24-To-48-Hour Timing

Use relative timing so the team can choose a real launch timezone. Pick a launch window where maintainers can stay present, especially during the first 4 hours.

### T-24 To T-2 Hours

- Freeze launch copy except for typo fixes.
- Run the local setup path and record any known limitations.
- Prepare the four channel drafts in this directory.
- Confirm the primary link for each channel:
  - Hacker News: GitHub repo.
  - Reddit: GitHub repo, unless subreddit rules prefer a text post with the link inside.
  - X / Twitter: GitHub repo or Show HN thread, depending on which post is live.
  - Product Hunt: Product Hunt page once live, with the GitHub repo in the maker comment.
- Identify no more than 1 primary Reddit community and 2 backup communities. Only use communities where the post is allowed and the team is already willing to participate.
- Assign responders:
  - HN responder.
  - Reddit responder.
  - X / Twitter responder.
  - Product Hunt responder.
  - GitHub issue triage responder.

### Launch Day, Hour 0 To Hour 6

- H-0:30: run final smoke checks on README links, repo visibility, and `task up:dev` docs.
- H+0:00: submit Show HN with the GitHub repo as the primary link.
- H+0:05: add the prepared Show HN maintainer comment.
- H+0:15: publish the first X / Twitter launch post pointing at the repo or Show HN thread.
- H+0:45 to H+1:30: post to one relevant Reddit community if the rules allow it.
- H+2:00: publish a technical X / Twitter follow-up with the architecture and local command.
- H+3:00: triage repeated questions into README or docs issues if they reveal real gaps.
- H+4:00 to H+6:00: post a short status follow-up only if there is real signal, such as a setup fix, useful discussion, or a clear architecture answer.

### Product Hunt Option

Run Product Hunt either as part of the same 24-hour push or as day 2 of a 48-hour push. Use it only if someone can cover comments throughout the Product Hunt launch day.

- Publish the maker comment immediately after the Product Hunt page is live.
- Share organically on X / Twitter and relevant existing communities.
- Do not mass-message people for votes.
- Do not offer incentives for upvotes.
- Do not coordinate voting groups.
- Point technical visitors back to GitHub for source, setup, and issues.

### Day 2, Hour 24 To Hour 48

- Publish one honest recap on X / Twitter: what people asked, what was fixed, and what feedback is still wanted.
- Reply to unresolved HN, Reddit, and Product Hunt comments.
- Open GitHub issues for real defects found during launch.
- Update docs only for confirmed gaps.
- Stop posting if there is nothing new to add.

## Response Notes

Respond like maintainers, not a campaign.

- Answer the question asked before linking anything.
- Disclose affiliation when posting outside project-owned accounts.
- Thank people for specific bugs or setup reports.
- Admit missing features plainly.
- Move bug reports to GitHub issues once the thread has enough context.
- Do not argue about votes, ranking, or platform moderation.
- Do not paste the same reply across platforms.
- Use the [Launch Day Triage](./launch-day-triage.md) flow for GitHub issues, first-time PRs, and repeated setup questions.

Useful response frames:

- Setup friction: "That is fair. The local stack should run with `task up:dev`, but real calls need LiveKit plus Twilio or Telnyx credentials. If you hit a setup failure before that point, please share the command and error."
- Production readiness: "The repo is intended to be inspectable and self-hostable. We are not claiming a managed production SLA from the open-source repo."
- Compliance: "We should not claim HIPAA, SOC 2, or similar compliance from the repo alone. That depends on deployment, controls, provider agreements, and operating process."
- Comparison to Retell or other closed platforms: "The tradeoff is control versus convenience. QuickVoice exposes the stack so teams can inspect, self-host, and modify it; a hosted voice-agent API will usually be faster if you only need a managed endpoint."
- License: "QuickVoice uses the permissive MIT License. Teams may use, modify, distribute, sublicense, and sell copies while retaining the license notice."

## Launch Links To Fill In

Fill these after posting:

- GitHub repo: https://github.com/allgpt-co/QuickVoice
- Website: https://quickvoice.co
- Show HN:
- Reddit:
- X / Twitter announcement:
- X / Twitter technical follow-up:
- Product Hunt:
