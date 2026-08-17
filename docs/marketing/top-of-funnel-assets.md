# QuickVoice Top-Of-Funnel Marketing Assets

## Asset 1: Landing Page Copy

### Hero Section

#### Headline Variations

1. **Own the AI phone-agent stack your customers call into.**
2. **AI phone agents, without a black-box runtime.**
3. **Run voice agents on infrastructure your team can inspect.**

#### Subheadline

QuickVoice is MIT-licensed, self-hostable AI phone-agent infrastructure: a Next.js console, Express/Node API, Python FastAPI service, LiveKit Agents worker, Twilio/Telnyx telephony, Postgres/Prisma, Redis/BullMQ, S3-compatible storage, Pinecone knowledge retrieval, MCP tools, call logs, and billing paths in one repo.

#### CTA Buttons

- Primary: **Inspect The Stack**
- Secondary: **Run It Locally**

#### Supporting Microcopy

Local evaluation starts with `task up:dev`. Real calls require LiveKit plus Twilio or Telnyx credentials.

### Why Open Source? Feature Grid

#### Card 1: Source-Level Runtime Control

**Technical reality:** The voice loop lives in a Python LiveKit Agents worker with Silero VAD, multilingual turn detection, telephony-aware noise cancellation, interruptible first messages, optional preemptive generation, and configurable STT, LLM, and TTS models.

**Business benefit:** Your team can review and change the call behavior instead of filing tickets against a hosted runtime you cannot see.

**Pillar:** Privacy and customization.

#### Card 2: Bring Your Own Providers

**Technical reality:** QuickVoice integrates directly with LiveKit, Twilio, Telnyx, Postgres, Prisma, Redis/BullMQ, S3-compatible object storage, Pinecone, Google embeddings, Stripe, and MCP/Smithery.

**Business benefit:** You can reason about raw infrastructure costs, vendor contracts, data residency, and failure modes without paying for an opaque bundle on every minute.

**Pillar:** Cost and provider control.

#### Card 3: Inspectable Data Paths

**Technical reality:** Call logs, transcripts, recordings, runtime config, knowledge sources, secrets, API keys, audit logs, retention jobs, and MCP execution logs are modeled in the repo. The server includes org-scoped auth, permission checks, secret references, PII redaction, safe URL validation, and zero-PII retention behavior.

**Business benefit:** Security and compliance teams can trace where voice data moves before production, then tune retention and storage to match their own policies.

**Pillar:** Privacy and auditability.

### Technical Proof Section

#### Section Headline

Trace a call through the stack.

#### Section Intro

Most hosted voice-agent APIs hide the path between carrier audio, model calls, tool execution, and persisted logs. QuickVoice turns that path into inspectable code.

#### Recommended Layout

Use a horizontal call-path diagram with clickable stages. Selecting a stage opens a side panel with the relevant runtime responsibility, technology, and source-backed proof point.

#### Call Path Stages

1. **Carrier Entry**
   - Visual: Phone call enters through Twilio or Telnyx.
   - Proof copy: Phone numbers are searched, purchased, linked, and unlinked through provider-specific server flows.

2. **LiveKit SIP**
   - Visual: Twilio/Telnyx routes the call into LiveKit SIP.
   - Proof copy: QuickVoice binds linked numbers to LiveKit trunks and dispatches rooms for inbound and outbound calls.

3. **Python Voice Worker**
   - Visual: Audio reaches the LiveKit Agents worker.
   - Proof copy: The worker handles VAD, turn detection, noise cancellation, STT, LLM, TTS, interruption behavior, and first-message playback.

4. **Runtime Config**
   - Visual: Worker requests agent config from the Express API.
   - Proof copy: Config loads by phone number or agent ID, then normalizes prompts, model IDs, language, voice, RAG, privacy settings, and MCP connections.

5. **Knowledge And Tools**
   - Visual: Optional branches to Pinecone and MCP.
   - Proof copy: Agents can retrieve Pinecone-backed context with Google embeddings and call allowlisted MCP tools through the server bridge.

6. **Post-Call Data**
   - Visual: Logs, transcripts, recordings, and usage flow back to storage.
   - Proof copy: Call logs persist in Postgres, recordings are written to S3-compatible storage, Stripe metering can report call minutes, and retention jobs clean up old records.

#### Interactive Element

Add a “closed API vs QuickVoice” toggle:

- **Closed API:** Carrier, runtime, model routing, logs, recordings, and tool calls collapse into one external box labeled “vendor-owned path.”
- **QuickVoice:** The same call expands into visible boxes for LiveKit, Express API, Python worker, Postgres, Redis, S3, Pinecone, MCP, and Stripe.

#### Final Section CTA

**Review the repo before you trust the runtime.**

Button copy: **Open GitHub**

## Asset 2: 60-Second Video Explainer Script

| Visual Action                                                                                                                                                                                         | Audio / Voiceover                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A CTO review screen: “Vendor Security Questionnaire.” The form highlights fields like data retention, subprocessors, call recordings, model providers, audit logs, and deletion policy.               | “AI phone agents are easy to demo. They are harder to approve.”                                                                                                                                                                       |
| Cut to a simplified closed vendor diagram: phone call enters one large black box labeled “Hosted voice API.” Small labels disappear inside: audio, transcript, tool calls, recordings, model routing. | “With a closed voice API, the most important paths are outside your repo. Where did the recording go? Which service touched the transcript? How are tool calls logged? What happens when legal asks for retention controls?”          |
| Security reviewer rejects the architecture with comments: “Unclear data path,” “Unknown retention,” “Provider bundle not reviewable.”                                                                 | “That is where enterprise security reviews slow down. The voice product might work, but the data path is not inspectable enough to trust.”                                                                                            |
| Terminal opens on the QuickVoice repo. Show folders: `apps/web`, `apps/console`, `apps/server`, `apps/ai`, `prisma`, `docker-compose.dev.yml`.                                                        | “QuickVoice takes the opposite approach. It is open-source, self-hostable AI phone-agent infrastructure.”                                                                                                                             |
| Architecture diagram builds from left to right: Twilio/Telnyx -> LiveKit SIP -> Python LiveKit worker -> Express API -> Postgres/Redis/S3.                                                            | “Calls enter through Twilio or Telnyx, route through LiveKit SIP, and run through a Python LiveKit Agents worker. The API is Express and Node. The data layer is Postgres with Prisma, Redis with BullMQ, and S3-compatible storage.” |
| Worker code highlights: VAD, turn detection, noise cancellation, STT, LLM, TTS, preemptive generation.                                                                                                | “The real-time voice loop is visible: VAD, turn detection, noise cancellation, STT, LLM, TTS, first-message behavior, and interruption handling.”                                                                                     |
| Split panel shows optional branches: Pinecone knowledge retrieval, MCP tool call, Stripe usage event.                                                                                                 | “Need retrieval or tools? QuickVoice includes Pinecone-backed knowledge search with Google embeddings, MCP tool connections, and Stripe metered usage hooks.”                                                                         |
| Privacy panel: PII redaction, zero-PII retention, secret references, audit logs, retention jobs.                                                                                                      | “Need to answer security? The repo shows PII redaction, zero-PII retention behavior, secret handling, audit logs, and scheduled retention cleanup.”                                                                                   |
| Back to architecture diagram. The black box is replaced by inspectable components with file path labels.                                                                                              | “You still bring real providers: LiveKit, Twilio or Telnyx, model providers, storage, and deployment. But now your team can inspect the stack before customers call into it.”                                                         |
| Final screen: QuickVoice logo, GitHub repo, CTA buttons.                                                                                                                                              | “QuickVoice: AI phone agents on infrastructure your team can run, review, and change. Open the repo. Trace the call path. Then decide where production should live.”                                                                  |

## Asset 3: Developer-Focused Social Media Hooks

### Post 1: The Economic Angle

Voice-agent pricing gets expensive when the platform fee sits on top of every raw provider cost.

Simple math:

`monthly platform markup = call minutes x hosted vendor markup per minute`

At 100,000 call minutes/month:

- $0.03/min markup = $3,000/month
- $0.05/min markup = $5,000/month
- $0.08/min markup = $8,000/month

That is before the underlying costs you are already paying for in some form: telephony, STT, LLM tokens, TTS, recordings, storage, logs, and infrastructure.

QuickVoice takes a different route.

It is MIT-licensed, self-hostable AI phone-agent infrastructure built with LiveKit Agents, Twilio/Telnyx, Express/Node, Python/FastAPI, Postgres/Prisma, Redis/BullMQ, S3-compatible storage, Pinecone, and Stripe usage hooks.

You still pay your real providers. You just stop treating the entire voice stack as an opaque per-minute bundle.

Bring your own infrastructure. Inspect the call path. Decide what the margin should be.

### Post 2: The Security / Infosec Angle

The fastest way to stall an AI voice project:

“We send customer calls to a hosted API, and the vendor handles the rest.”

Security hears:

- Where are recordings stored?
- Are transcripts retained?
- Which model providers touch the call?
- Can we redact PII before persistence?
- Who can access call logs?
- Can we delete old transcripts?
- How are tool calls audited?
- What happens if the vendor changes the runtime?

That is a hard review when the runtime is a black box.

QuickVoice is built for teams that need to answer those questions from source.

The repo includes the LiveKit worker, Express API, Python FastAPI service, Postgres schema, Redis/BullMQ queues, S3 recording path, call-log ingestion, PII redaction, zero-PII retention behavior, encrypted secret references, audit logs, retention jobs, and MCP tool execution logs.

It does not magically make a deployment compliant.

It does make the data path inspectable before sensitive voice traffic touches production.

### Post 3: The Customization / Hackability Angle

Most voice-agent platforms let you tune prompts.

That is useful. It is not the same as owning the runtime.

With QuickVoice, the voice-agent loop is in the repo:

- Python LiveKit Agents worker
- Silero VAD
- multilingual turn detection
- telephony-aware noise cancellation
- interruptible first message
- optional preemptive generation
- configurable STT, LLM, and TTS model IDs
- Pinecone-backed RAG
- MCP tool allowlisting
- call-log finalization

Want to change how interruptions work?

Want to change when retrieval runs?

Want to block side-effect tools during live calls?

Want outbound campaigns to inject different first messages, voices, languages, or dynamic variables per recipient?

Those are source-level changes, not support tickets.

QuickVoice is for teams that want a productized AI phone-agent stack without giving up the right to modify the stack.
