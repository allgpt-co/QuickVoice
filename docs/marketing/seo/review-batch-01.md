# SEO article review batch 01 — 2026-09-06

This batch completes source review and substantive refreshes for six articles from the original 78-article backlog. The work is based on `main` at `8c12f5cf1507b8b6f2b2d1a10c3ca97032d4bd7f` in the isolated `agent/seo-content-20260906` branch. The release owner will integrate and deploy the commit separately.

The six URLs and original publication dates are preserved. Each article has `updatedAt: 2026-09-06` and a current content-bound review issued by `scripts/review-seo-article.mjs` after formatting and factual review. The review identifies Codex as the reviewer and records the primary sources used. It is not customer evidence or a claim of improved search performance.

## Approved order and editorial decisions

| Order | Article                                                                                                                                              | Original date | Result and distinct reader intent                                                                                                                                                                                                         | Relevant commercial route                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1     | [ElevenLabs vs Deepgram](../../../apps/web/content/blog/week-20-elevenlabs-vs-deepgram.md) — `elevenlabs-vs-deepgram-voice-ai`                       | 2026-07-13    | Retained and rewritten as a speech-component evaluation for business calls. Separates recognition, generation, and the complete calling workflow; removes an unsupported universal winner.                                                | `/company/contact`                                          |
| 2     | [After-hours handling](../../../apps/web/content/blog/ai-after-hours-call-handling.md) — `ai-after-hours-call-handling`                              | 2026-03-19    | Retained and rewritten around approved information, callback ownership, opening hours, escalation, and acceptance exercises. Removes guaranteed lead capture and invented outcomes.                                                       | `/solutions/ai-answering-service`                           |
| 3     | [Online appointment scheduling](../../../apps/web/content/blog/online-appointment-scheduling-ai-voice.md) — `online-appointment-scheduling-ai-voice` | 2026-03-19    | Retained with channel-selection intent: when a booking link is enough, when phone clarification helps, and how both channels preserve one authoritative booking state.                                                                    | `/use-cases/appointment-scheduling`                         |
| 4     | [Meeting coordination](../../../apps/web/content/blog/ai-meeting-scheduler-voice-automation.md) — `ai-meeting-scheduler-voice-automation`            | 2026-03-19    | Retained with business-meeting intent: host pools, required attendees, organizer authority, invitations, acceptance, and coordinated changes. Does not duplicate the booking-link article or the implementation-focused scheduling guide. | `/company/contact`                                          |
| 5     | [AI vs human costs](../../../apps/web/content/blog/week-09-ai-vs-human-agents-cost-comparison.md) — `ai-vs-human-agents-cost-comparison`             | 2026-04-27    | Retained and rewritten as a matched-outcome cost comparison with the existing worksheet and current repository billing structure. Removes invented wages, savings, customer results, and obsolete subscription assumptions.               | `/pricing`                                                  |
| 6     | [Voice-agent foundation](../../../apps/web/content/blog/week-01-what-is-ai-voice-agent.md) — `what-is-an-ai-voice-agent`                             | 2026-03-02    | Retained as the foundational business guide, with bounded workflow examples and concrete evaluation questions. Keeps the pillar marker and links to reviewed workflows and guides.                                                        | `/solutions/ai-receptionist`, `/use-cases/customer-support` |

Every article has one final contact CTA. Existing relevant workflow and reviewed-guide links provide context. No redirects or URL consolidation are needed for this batch.

## Source and capability review

Sources were read on September 6, 2026. Provider documentation describes upstream offerings; the local repository determines what QuickVoice currently exposes. Model names, prices, permissions, and product functionality can change and should be checked again when a later substantive revision is made.

### 1. ElevenLabs vs Deepgram

Primary sources: ElevenLabs [speech recognition](https://elevenlabs.io/docs/overview/capabilities/speech-to-text) and [speech generation](https://elevenlabs.io/docs/overview/capabilities/text-to-speech); Deepgram [recognition models](https://developers.deepgram.com/docs/models-languages-overview) and [TTS models](https://developers.deepgram.com/docs/tts-models).

Repository evidence: [voice provider adapters](../../../apps/ai/handlers/voice_provider_adapters.py), [console voice catalog](../../../apps/console/src/lib/data/voices.ts), and [setup boundaries](../../../README.md#setup-boundaries). The implementation includes Deepgram recognition and Deepgram/ElevenLabs speech-generation paths. Upstream provider features are not represented as universally selectable QuickVoice features. The article makes no default-provider, voice-quality, latency, or benchmark claim.

### 2. After-hours call handling

Repository evidence: [README](../../../README.md), [AI answering-service workflow data](../../../apps/web/data/workflow-pages.ts), and [live MCP handler](../../../apps/ai/handlers/mcp_handler.py).

The article treats coverage schedules, callback destinations, urgent instructions, and human availability as business and implementation responsibilities. It does not assert a native scheduling dashboard, external dispatch, or completed human-transfer feature. Suggested scripts and acceptance cases are explicitly planning examples. It distinguishes a recorded request from a verified reservation.

### 3. Booking links and phone workflows

Primary sources: [Google Calendar appointment schedules](https://support.google.com/calendar/answer/11608416), [Calendly event types](https://calendly.com/help/event-types-overview), Google Calendar [free/busy queries](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), and [event creation](https://developers.google.com/workspace/calendar/api/guides/create-events).

The sources establish booking-page approaches and the distinction between an availability read and a calendar write. The article does not claim native QuickVoice calendar integration or automatic prevention of concurrent double bookings. It asks the implementation team to verify the authoritative result and test cross-channel conflicts.

### 4. Business meeting coordination

Primary sources: [Calendly event arrangements](https://calendly.com/help/event-types-overview), Google Calendar [free/busy queries](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), and [event creation](https://developers.google.com/workspace/calendar/api/guides/create-events).

Host availability, event creation, invitation delivery, attendee acceptance, and a meeting actually taking place remain separate outcomes. Product-plan access is qualified; no plan price or universal feature availability is asserted. Multi-calendar negotiation and organizer delegation require their own verified integration.

### Shared scheduling limitation

The [live MCP handler](../../../apps/ai/handlers/mcp_handler.py) filters tool instructions and rejects execution when a tool is marked `requiresConfirmation`, `sideEffect`, or a write/mutation/side-effect mode. The articles describe that behavior precisely as applying to marked tools. They do not infer that unmarked tools are harmless. A separately implemented, permitted action path and destination verification are required before promising a booking or meeting write.

### 5. Cost comparison

Repository evidence: [billing catalog](../../../apps/server/data/billing-rates.json), [rating implementation](../../../apps/server/src/modules/billing/rate-catalog.service.ts), [hosted pricing component](../../../apps/web/src/components/pricing/usage-pricing.tsx), [cost worksheet](cost-estimation.csv), and [worksheet instructions](cost-estimation-guide.md).

The reviewed catalog is `2026-08-01.1`: 20% AI/telephony markup, a $0.01 platform fee per connected minute, and a $2 number-rental floor. The rating implementation applies the platform fee by whole connected second and number rental as the greater of the floor or provider rent plus telephony markup. The pricing component describes the 30-day rental period. These are separate hosted charge components, not an all-inclusive quote. Self-hosted expenses are treated separately.

The worksheet's example inputs are identified as illustrative and unknown supplier rates as unknown. Validation flags do not prove external evidence. The comparison separates cash savings from staff capacity and modeled estimates from measured outcomes.

The article currently links to the existing public GitHub worksheet and instructions. A buyer-facing resources route is being prepared separately; once that route is integrated, changing the article link requires another valid content review. It is not a missing dependency for the existing links.

### 6. Voice-agent foundation

Primary source: [LiveKit agent documentation](https://docs.livekit.io/agents/) for voice pipelines and realtime speech approaches.

Repository evidence: [README](../../../README.md), [setup boundaries](../../../README.md#setup-boundaries), and [live MCP handler](../../../apps/ai/handlers/mcp_handler.py). The article identifies MIT licensing, self-hosting, active development without a stable release, provider configuration, and technical ownership. Workflow examples are bounded proposals rather than claimed built-in integrations or customer deployments. It contains no invented deployment time, customer statistics, certification, or compliance guarantee.

## Validation completed on this revision

| Check                                                 | Observed result                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --ignore-scripts`     | Passed; dependency manifests and lockfile unchanged.                                                                                                                                                                                               |
| Prettier on the six articles                          | Applied before the review CLI. Article bodies were not reformatted after their content fingerprints were issued.                                                                                                                                   |
| Six targeted public-claims audits and review issuance | Passed; each CLI invocation issued a current review after its targeted audit. Factual review above supplements the pattern scan.                                                                                                                   |
| `pnpm claims:audit:seo`                               | Passed across 75 public-content files with no blocked findings.                                                                                                                                                                                    |
| `pnpm --filter web test`                              | 27 passed.                                                                                                                                                                                                                                         |
| `node --test tests/*.test.mjs`                        | 37 passed. An existing module-type inference warning appeared for the docs API-reference fixture.                                                                                                                                                  |
| `pnpm --filter web lint`                              | Passed with zero warnings allowed.                                                                                                                                                                                                                 |
| `pnpm --filter web check-types`                       | Passed.                                                                                                                                                                                                                                            |
| `pnpm --filter web build`                             | Passed with 138 generated pages. Local production build ID: `qcpGlKwOYufe3wRAwDg8f`.                                                                                                                                                               |
| Local production HTTP checks                          | All six URLs returned 200 with one H1, an apex canonical, a description, `index, follow`, parseable BlogPosting data, preserved publication dates, and `dateModified: 2026-09-06`.                                                                 |
| Internal links                                        | All 12 distinct relative links in the six article bodies returned 200 in the local production server.                                                                                                                                              |
| Review and sitemap eligibility                        | 18 valid reviewed articles total: the previous 12 plus this batch. The local sitemap contains 51 entries: 33 static routes and those 18 articles. All six new article entries use the substantive update date as lastmod.                          |
| Publication boundaries                                | All 90 original slugs and publication dates match the base revision; 25 future-dated articles remain future-dated. Sample legacy `ai-billing-payment-calls` stays 200/noindex without BlogPosting schema; future `quickvoice-vs-vapi` returns 404. |
| Inventory scope                                       | Exactly six rows changed; the other 150 rows remain unchanged. Historical `program_group: backlog` is preserved, while those six review and indexing statuses identify completed local verification.                                               |
| Whitespace and document links                         | `git diff --check` passed; batch-report local links resolve.                                                                                                                                                                                       |

The HTTP checks used a local production server on port 3217. They establish behavior of this built revision, not a live deployment, Google indexing, ranking improvement, or business conversion result.

At this branch revision, 72 articles from the original backlog still await review; the 33 illustrative scenarios are unchanged by this batch. The inventory is the per-asset status source. Release and subsequent batches remain with the program owner.
