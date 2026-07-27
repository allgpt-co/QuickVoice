# QuickVoice Enterprise Sales Enablement Toolkit

## Asset 1: 8-Slide Enterprise Pitch Deck Outline And Script

### Slide 1: Title And Hook

**Slide title:** Own The AI Phone-Agent Stack Your Customers Call Into

**Subtitle:** Self-hostable, source-visible voice-agent infrastructure for teams that need control over call behavior, data paths, and provider economics.

**Visual layout idea:** Full-width architecture strip across the bottom: Twilio/Telnyx -> LiveKit SIP -> Python LiveKit worker -> Express API -> Postgres/Redis/S3. Above it, a short headline and one proof point: "MIT-licensed repo. Runtime, API, data model, queues, retention, and telephony binding are inspectable."

**Sales rep talk track:**

"QuickVoice is for teams that cannot treat customer phone calls as a black box. It gives engineering and security teams a self-hostable voice-agent stack they can run, inspect, and modify: the console, API server, Python LiveKit worker, Postgres schema, Redis queues, telephony integrations, retention behavior, and call logging paths are all in the repository. The enterprise value is control: control over how the agent behaves, where call artifacts are stored, which providers are used, and how the cost model is structured."

### Slide 2: The Status Quo Crisis

**Slide title:** Hosted Voice AI Creates Three Enterprise Risks

**Visual layout idea:** Three-column risk board:

- **Opaque data paths:** audio, transcripts, recordings, model calls, and tools disappear into a vendor-owned runtime.
- **Per-minute margin stack:** buyer pays the wrapper plus the underlying telephony, speech, LLM, TTS, storage, and infrastructure costs.
- **Limited runtime control:** prompt controls exist, but interruption handling, tool policies, retention behavior, and provider routing are usually not source-editable.

**Sales rep talk track:**

"Closed voice-agent APIs are useful for fast demos, but enterprise review usually starts after the demo works. Security asks where recordings live, which model providers process transcripts, how tool calls are audited, and whether retention can be tuned. Finance asks why every minute carries a platform markup on top of the raw provider costs. Engineering asks what happens when the agent needs business-specific behavior that cannot be expressed in a prompt. QuickVoice exists because those questions are infrastructure questions, not just product settings."

### Slide 3: Introducing QuickVoice

**Slide title:** QuickVoice Is The Self-Hostable Alternative

**Visual layout idea:** Replace one large "hosted voice API" box with visible components: Next.js console, Express/Node API, Python FastAPI service, LiveKit Agents worker, Postgres/Prisma, Redis/BullMQ, S3-compatible recording storage, Pinecone, MCP/Smithery, Stripe hooks, Twilio/Telnyx, and LiveKit.

**Sales rep talk track:**

"QuickVoice is an MIT-licensed, self-hostable Retell alternative for AI phone agents. The server is TypeScript on Express. The app uses Prisma with Postgres, Redis with BullMQ, and S3-compatible storage for recordings. The real-time voice loop runs in Python on LiveKit Agents with Silero VAD, multilingual turn detection, telephony-aware noise cancellation, configurable STT, LLM, and TTS models, and optional preemptive generation. Telephony is implemented through Twilio and Telnyx provisioning, with LiveKit SIP for call routing."

### Slide 4: Technical Architecture And Data Paths

**Slide title:** The Call Path Is Inspectable End To End

**Visual layout idea:** Sankey-style flow with explicit trust boundaries:

1. **Carrier entry:** Twilio or Telnyx receives the call.
2. **SIP/media routing:** LiveKit SIP connects the phone call to a LiveKit room.
3. **Voice runtime:** Python LiveKit Agents worker handles VAD, turn detection, STT, LLM, TTS, first-message playback, interruption behavior, and noise cancellation.
4. **Runtime configuration:** Worker fetches agent config from the Express API by phone number or agent ID using internal auth.
5. **Optional context and tools:** Pinecone-backed RAG with Google `text-embedding-004`; allowlisted MCP/Smithery tools through the server bridge.
6. **Persistence and cleanup:** Postgres call logs, Redis/BullMQ jobs, S3-compatible recordings, Stripe usage hooks, PII redaction, zero-PII retention behavior, and retention jobs.

**Sales rep talk track:**

"The important message is not that QuickVoice removes every third party. Real phone calls still require customer-chosen providers such as LiveKit, Twilio or Telnyx, speech/model providers, object storage, and vector search. The difference is that QuickVoice removes the extra opaque wrapper layer. The external boundaries are visible in code, provider credentials are brought by the customer, and security teams can inspect how call logs, transcripts, recordings, RAG context, MCP tool calls, and retention settings move through the system before production traffic goes live."

**Rep guardrail:** Do not claim external providers never touch audio. Say "no hidden wrapper-owned data path; provider boundaries are explicit and customer-controlled."

### Slide 5: Enterprise-Grade Customization

**Slide title:** Business Rules Belong In Source, Not Support Tickets

**Visual layout idea:** Split screen: left side shows configurable controls; right side shows source-editable runtime areas.

- Configurable: prompts, first message, voice, language, STT/LLM/TTS model IDs, RAG toggle, retention settings, call audio storage, outbound metadata overrides.
- Source-editable: LiveKit worker, interruption behavior, `speak_first_message`, RAG injection, MCP allowlisting, tool confirmation policy, call finalization, outbound campaign queue behavior.

**Sales rep talk track:**

"Many platforms let customers tune prompts. QuickVoice lets engineering teams change the runtime. The worker can be modified where the call actually happens: turn handling, interruption policy, first-message behavior, RAG timing, MCP tool execution, and final call logging. The API and data model are also available, so teams can adapt org permissions, audit logs, secret handling, retention jobs, outbound campaigns, and metering to match internal policy instead of negotiating feature requests with a closed vendor."

### Slide 6: The Economic Blueprint

**Slide title:** Shift From Wrapper Margin To Raw Infrastructure Costs

**Visual layout idea:** Cost stack comparison:

- **Closed platform:** per-minute platform fee + telephony + STT + LLM + TTS + recording/storage + add-on fees.
- **QuickVoice:** customer-operated app + LiveKit + Twilio/Telnyx + selected model providers + Postgres + Redis + S3-compatible storage + Pinecone + infrastructure.

Include a simple formula:

`avoidable wrapper spend = monthly minutes x vendor markup per minute`

**Sales rep talk track:**

"QuickVoice does not make voice AI free. Customers still pay for telephony, LiveKit, model inference, storage, databases, queues, vector search, and compute. The economic change is that they stop buying the whole runtime as a bundled per-minute black box. At enterprise volume, even a few cents of wrapper markup per minute becomes a material line item. QuickVoice lets finance and engineering reason about the actual cost drivers and decide which providers should own the margin."

### Slide 7: Deployment And Compliance Alignment

**Slide title:** Fit The Stack Into Your Existing Control Plane

**Visual layout idea:** Customer VPC diagram with deployable containers:

- `apps/server/Dockerfile`: Express/Node API container; runs Prisma migrations before `node dist/src/index.js`.
- `apps/ai/Dockerfile`: Python 3.12 container running FastAPI and the LiveKit worker via `python main.py serve`.
- External managed or self-managed dependencies: Postgres, Redis, S3-compatible storage, LiveKit, Twilio/Telnyx, Pinecone, model providers, email, OAuth, Stripe.
- Dev local path: `docker-compose.dev.yml` for Postgres, Redis, and Mailpit; `task up:dev` for local evaluation.

**Sales rep talk track:**

"QuickVoice is designed to fit into the buyer's infrastructure and security review process. The repo ships Dockerfiles for the API server and AI service, plus local Compose services for Postgres, Redis, and Mailpit during development. In production, teams can deploy those containers into their cloud environment and connect them to their chosen Postgres, Redis, object storage, LiveKit, telephony, vector database, and model-provider accounts. That does not automatically make a deployment satisfy SOC 2 or HIPAA requirements. It does give the buyer a code-visible architecture they can align with their own controls, BAAs, subprocessors, retention policy, logging policy, and audit evidence."

**Rep guardrail:** Do not say QuickVoice "guarantees SOC2/HIPAA." Say "supports SOC2/HIPAA alignment work when deployed with the right organizational controls, contracts, and audits."

### Slide 8: Next Steps And Call To Action

**Slide title:** From POC Sandbox To Production Review

**Visual layout idea:** Four-step rollout ladder:

1. **Repo review:** inspect call path, Dockerfiles, Prisma schema, worker, security controls, and provider integrations.
2. **Local evaluation:** run `task up:dev`; validate console, API, Postgres, Redis, and AI worker behavior.
3. **Provider-connected POC:** connect LiveKit, Twilio or Telnyx, STT/LLM/TTS provider credentials, S3-compatible recording storage, Pinecone, and internal test agents.
4. **Production readiness:** define deployment topology, retention policy, provider contracts, monitoring, capacity plan, and security sign-off.

**Sales rep talk track:**

"The next step is not a generic demo. It is a technical POC that proves the call path under the buyer's own assumptions. We start with repository review, then local evaluation, then a provider-connected POC using their selected LiveKit, telephony, model, storage, and database accounts. From there, production readiness is a normal enterprise architecture process: deployment, capacity, retention, monitoring, audit evidence, and operating ownership."

**CTA copy:** Review the repo. Trace a real call. Decide where production should run.

## Asset 2: Product One-Pager Copy

### Executive Summary

QuickVoice is MIT-licensed, self-hostable AI phone-agent infrastructure for engineering-led teams that need source-level control over call behavior, data paths, and provider economics. It combines a Next.js console, Express/Node API, Python FastAPI service, LiveKit Agents worker, Twilio/Telnyx telephony, Postgres/Prisma, Redis/BullMQ, S3-compatible recordings, Pinecone knowledge retrieval, MCP tools, and Stripe usage hooks in one inspectable repository. Enterprises use QuickVoice when a closed voice API is too opaque for security review, too expensive at call volume, or too rigid for business-specific runtime behavior.

### Tech Stack At A Glance

- **License and repo model:** MIT-licensed monorepo managed with `pnpm` and Turbo.
- **Frontend:** Next.js web and console apps.
- **API server:** TypeScript, Express 5, Better Auth, API keys, org-scoped permissions, Helmet, rate limiting, Swagger.
- **Database:** Postgres with Prisma 7.
- **Queues and jobs:** Redis, BullMQ, Inngest.
- **Voice runtime:** Python 3.12, FastAPI, LiveKit Agents, Silero VAD, multilingual turn detection, LiveKit noise cancellation.
- **Telephony:** Twilio and Telnyx number provisioning with LiveKit SIP trunk binding.
- **Speech and models:** Configurable STT/LLM/TTS model IDs; defaults include Deepgram Nova-3 STT, Google Gemini 2.5 Flash LLM, and Deepgram Aura-2 TTS. Console/model support includes OpenAI, Anthropic, Google, Deepgram, AssemblyAI, Speechmatics, ElevenLabs, Cartesia, and Rime options.
- **Knowledge retrieval:** Pinecone namespaces with Google `text-embedding-004` embeddings.
- **Tools and integrations:** MCP/Smithery connections with per-agent allowlisting, side-effect/confirmation filtering, execution logs, and redacted outputs.
- **Storage and metering:** S3-compatible recording storage and Stripe metered usage hooks.
- **Privacy and security controls:** PII redaction, zero-PII retention behavior, retention jobs, encrypted secret envelopes, secret references, safe remote URL validation, audit logs, and internal server-to-server auth.

### Core Enterprise Benefits

#### Data Sovereignty

QuickVoice makes the data path reviewable. Call logs, transcripts, recordings, runtime config, knowledge sources, secrets, audit logs, MCP tool executions, and retention controls are modeled in source and persisted through customer-controlled infrastructure choices. Security teams can inspect what moves through Postgres, Redis, S3-compatible storage, Pinecone, LiveKit, Twilio/Telnyx, and model providers before production traffic is approved.

#### Scale Economics

QuickVoice separates the application layer from the vendors underneath it. Teams bring their own LiveKit, Twilio or Telnyx, Postgres, Redis, storage, vector database, model providers, and cloud compute instead of paying a voice API wrapper on every minute. The result is a cost model based on raw provider contracts and infrastructure utilization, not an opaque bundled margin.

#### No Vendor Lock-In

QuickVoice is source-visible infrastructure, not a hosted-only endpoint. Engineering teams can modify the worker, API server, database schema, retention behavior, RAG pipeline, MCP tool policy, outbound campaign queue, provider bindings, and billing hooks. If a provider, model, storage layer, or deployment target changes, the integration boundary is in the repo.

### Supported Deployment Environments

- **Local evaluation:** `task up:dev` plus `docker-compose.dev.yml` for Postgres, Redis, and optional Mailpit.
- **Containerized services:** `apps/server/Dockerfile` for the Express/Node API; `apps/ai/Dockerfile` for FastAPI and the LiveKit worker.
- **Production dependencies:** Postgres, Redis, LiveKit, Twilio or Telnyx, S3-compatible storage, Pinecone, model-provider credentials, OAuth/email providers, and Stripe if usage metering or billing is enabled.
- **Cloud targets:** AWS, GCP, Azure, Kubernetes, ECS, Cloud Run, AKS, GKE, or similar container platforms are viable deployment targets for the shipped containers, but production orchestration manifests are not currently included in the repository.
- **Compliance posture:** QuickVoice supports customer-controlled deployment and audit review. Compliance status depends on the buyer's infrastructure, policies, subprocessors, BAAs, access controls, monitoring, and audit process.

## Asset 3: Enterprise Objection-Handling Playbook

### Objection 1: Security / Infosec

**Buyer says:** "We handle highly confidential data. How do we know your platform won't leak our customer records or recordings?"

**Short answer:** "You should not take that on trust. QuickVoice is designed so your security team can inspect the data path and choose the provider boundaries before production."

**Sales script:**

"That is the right question for voice AI. QuickVoice is not asking you to send sensitive calls into an invisible hosted runtime. The repository includes the API server, Python LiveKit worker, call-log path, recording path, Prisma schema, retention behavior, secret handling, audit logs, and MCP tool execution path. You can see where transcripts and recordings are created, when recordings are skipped through zero-PII retention, how call logs are redacted, how secrets are encrypted or referenced, and how old records are cleaned up by retention jobs.

For real calls, you will still choose external providers: LiveKit, Twilio or Telnyx, STT/LLM/TTS providers, S3-compatible storage, Pinecone, and any connected tools. The enterprise advantage is that those boundaries are explicit. Your team can map them to contracts, BAAs where needed, network controls, storage policy, retention policy, and audit evidence instead of relying on a vendor-owned black box."

**Technical proof points to cite:**

- PII redaction in call-log handling and logging utilities.
- Zero-PII retention behavior that skips transcript and recording persistence when enabled.
- S3-compatible recording path controlled by customer credentials.
- Encrypted secret envelopes and secret references.
- Safe remote URL validation for external document ingestion paths.
- Org-scoped permissions, API keys, internal auth, and audit logs.
- MCP tool allowlisting, side-effect/confirmation filtering, and redacted tool results.

**Do not say:** "No data leaves your environment." QuickVoice can be deployed in customer infrastructure, but calls still route through configured providers unless the buyer replaces those provider choices.

### Objection 2: Latency / Performance

**Buyer says:** "Voice AI requires sub-second latency. How does your open-source stack ensure real-time performance compared to heavily funded platforms like Vapi or Retell?"

**Short answer:** "QuickVoice uses a real-time LiveKit architecture and exposes the runtime controls that affect latency. We should validate target latency in your POC using your providers, regions, models, and call flows."

**Sales script:**

"We should be precise here: QuickVoice does not publish a blanket latency guarantee. Latency in voice AI depends on telephony route, LiveKit region, STT model, LLM model, TTS model, tool calls, RAG retrieval, network placement, and prompt behavior. What QuickVoice gives you is direct access to the real-time path rather than a closed API.

The worker uses LiveKit Agents with Silero VAD, multilingual turn detection, telephony-aware noise cancellation, interruptible first messages, and optional preemptive generation. STT, LLM, and TTS model IDs are configurable per agent. If a workflow needs lower latency, your team can change model selection, reduce prompt/tool complexity, tune when retrieval runs, disable slow external tools, colocate services, and profile the worker directly. With a closed platform, those levers are usually hidden behind vendor support."

**Technical proof points to cite:**

- LiveKit Agents runtime instead of a custom polling workflow.
- `TurnHandlingOptions` with multilingual turn detection.
- Silero VAD and LiveKit noise cancellation.
- Optional preemptive generation.
- Configurable Deepgram/Google/OpenAI/Anthropic/ElevenLabs/Cartesia/Rime/AssemblyAI/Speechmatics model boundaries.
- RAG and MCP are optional paths, not mandatory for every turn.

**Do not say:** "We guarantee sub-second latency." Say: "The architecture is built for real-time calls, and the exact latency envelope is validated in the buyer's POC."

### Objection 3: Maintenance / TCO

**Buyer says:** "Open source means my engineering team has to maintain the infrastructure. Why shouldn't we just pay an API wrapper to handle infrastructure management?"

**Short answer:** "If you only need a fast demo, a hosted wrapper may be simpler. QuickVoice is for teams where control, security review, and per-minute economics justify owning the stack."

**Sales script:**

"That tradeoff is real. QuickVoice is not the lowest-effort path for a nontechnical team that wants a no-code hosted system. It is the better fit when the buyer already has engineering ownership, security review requirements, and meaningful call volume.

With an API wrapper, the vendor runs the platform, but you also inherit their data path, runtime limits, provider bundle, pricing model, and roadmap. With QuickVoice, your team operates containers, Postgres, Redis, LiveKit, telephony credentials, storage, vector search, and model providers. In exchange, you get source-level control over runtime behavior, retention, logging, tool execution, provider selection, and cost structure.

The right TCO comparison is not 'open source is free.' It is 'engineering ownership plus raw provider costs' versus 'vendor operations plus opaque per-minute margin and limited customization.' For regulated workflows, high volume, or business-specific call logic, ownership often pays for itself in avoided markup, faster security approval, and fewer blocked feature requests."

**Technical proof points to cite:**

- Dockerfiles for the API server and AI service.
- Local dev orchestration through `task up:dev` and dev Compose for Postgres/Redis/Mailpit.
- Prisma migrations and generated API/server structure.
- BullMQ queues for ingestion and outbound campaign work.
- Stripe metered usage hooks for teams building their own billing or chargeback model.

**Do not say:** "There is no maintenance." Say: "Maintenance shifts from a voice wrapper vendor to your platform team, with a more transparent cost and control model."

### Objection 4: Scalability

**Buyer says:** "What happens when our call volume spikes to thousands of concurrent calls? Can your architecture scale horizontally?"

**Short answer:** "The architecture separates stateless services, queues, storage, and the LiveKit worker path so it can be scaled horizontally, but large concurrency needs an explicit capacity plan and load test."

**Sales script:**

"QuickVoice is structured around horizontally scalable components, but we should not hand-wave thousands of concurrent calls without sizing. The Express API can run as multiple stateless containers behind a load balancer. The Python LiveKit worker can run as multiple worker processes or containers registered with LiveKit. Redis/BullMQ handles queued work such as knowledge ingestion and outbound campaigns. Postgres, Redis, LiveKit, Twilio or Telnyx, S3-compatible storage, Pinecone, and model providers each need production-grade sizing and quotas.

For a spike scenario, the POC should test the actual call shape: inbound versus outbound mix, average call length, STT/LLM/TTS choices, RAG frequency, MCP tool usage, recording policy, and retention settings. QuickVoice gives engineering teams the components and source access needed to scale deliberately. The production answer is a capacity plan across LiveKit rooms/workers, API replicas, Redis queues, Postgres connections, model-provider rate limits, telephony trunks, and recording storage throughput."

**Technical proof points to cite:**

- API server and AI worker are separate containerized services.
- LiveKit worker registration is independent from the Express API.
- Redis/BullMQ queues support asynchronous ingestion and outbound campaign workloads.
- Postgres/Prisma centralizes durable application state.
- Telephony provider and LiveKit trunk setup are explicit integration points.
- Per-agent configuration includes concurrent call and duration-oriented settings in the data model.

**Do not say:** "It automatically handles thousands of concurrent calls." Say: "It is architected for horizontal scaling, and enterprise concurrency is validated with customer-specific capacity testing."

## Rep-Safe Positioning Summary

- Lead with: source-level control, inspectable data paths, configurable provider boundaries, and raw infrastructure economics.
- Be explicit that QuickVoice uses external providers selected by the customer.
- Treat compliance as an alignment and evidence conversation, not a certification claim.
- Treat latency and concurrency as POC validation topics, not universal guarantees.
- Anchor every enterprise claim in concrete repo components: LiveKit Agents, Twilio/Telnyx, Express/Node, Python/FastAPI, Postgres/Prisma, Redis/BullMQ, S3-compatible storage, Pinecone, Google embeddings, MCP/Smithery, Stripe, PII redaction, zero-PII retention, secret handling, audit logs, and retention jobs.
