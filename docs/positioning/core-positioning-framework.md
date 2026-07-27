# QuickVoice Core Positioning Framework

## Technical Reality Check

QuickVoice is MIT-licensed, self-hostable AI phone-agent infrastructure for engineering-led teams that want source-level control over voice automation. The repository is a pnpm/Turborepo monorepo with a Next.js marketing site, Next.js console, Express/TypeScript API server, Prisma/Postgres data layer, Redis/BullMQ queues, Python FastAPI AI service, and LiveKit Agents worker.

The voice runtime is built around LiveKit, not a custom socket stack. The worker uses LiveKit Agents with STT, LLM, TTS, Silero VAD, multilingual turn detection, noise cancellation, interruptible first messages, and optional preemptive generation. Telephony is implemented through Twilio and Telnyx provisioning plus LiveKit SIP trunk binding.

The default AI path is commercial cloud inference, not local-first Ollama, vLLM, Llama, or Mistral. Agent configuration supports configurable STT, LLM, and TTS model IDs, with defaults and UI options oriented around providers such as Google, OpenAI, Anthropic, Deepgram, ElevenLabs, Cartesia, Rime, AssemblyAI, and Speechmatics. Knowledge retrieval uses Pinecone namespaces and Google text embeddings.

Local self-host evaluation is strong through `task up:dev`, which prepares env files, installs Node and Python dependencies, starts Postgres and Redis, runs Prisma migrations, and launches local services. Production calling still requires external provider setup: LiveKit plus Twilio or Telnyx credentials for real calls, and separate provider credentials for billing, OAuth, email, object storage, Pinecone, Google embeddings, and MCP/Smithery.

## Unique Selling Proposition

QuickVoice is open-source AI phone-agent infrastructure for teams that need to own the voice stack, not rent a black-box calling API.

Code-backed advantages over closed API-only platforms:

- Full-stack inspectability: console, API, worker, database schema, call logs, retention jobs, telephony binding, queues, billing paths, and runtime configuration are visible in the repository.
- Runtime extensibility: agents load per-call config by phone number or agent ID, retrieve knowledge context during live turns, execute allowlisted MCP tools, and support outbound metadata overrides for prompt, first message, language, voice, and dynamic variables.
- Provider and cost control: teams bring their own LiveKit, Twilio or Telnyx, Postgres, Redis, S3-compatible storage, vector database, model providers, and billing setup instead of accepting an opaque bundled per-minute stack.

## Ideal Customer Profile

QuickVoice is for engineering-led companies, platform teams, and CTOs evaluating AI phone agents where runtime behavior, call data, provider boundaries, deployment architecture, privacy review, and cost structure matter.

Best-fit buyers:

- Mid-market and enterprise engineering teams building internal or customer-facing voice automation.
- Regulated or operationally complex teams in healthcare, financial services, logistics, real estate, support, collections, ecommerce, and operations.
- Developer teams comparing Retell, Vapi, Bland AI, and similar hosted platforms but unwilling to place every call, log, integration, and provider decision behind a closed vendor layer.

Poor-fit buyers:

- Nontechnical teams expecting an instant fully managed no-code phone-agent SaaS from a fresh clone.
- Teams that only want a hosted SLA and do not need to inspect, change, or self-host the infrastructure.

## Core Value Pillars

### 1. Privacy And Control

QuickVoice makes sensitive data paths inspectable. The code includes org-scoped auth and permissions, API keys, audit logs, internal server-to-server boundaries, encrypted secret references, redacted secret outputs, SSRF-resistant remote URL validation, PII redaction for call logs, zero-PII retention controls, customer-controlled S3-compatible recording storage, and scheduled retention jobs for transcripts, recordings, failed KB records, and MCP logs.

### 2. Performance And Customization

QuickVoice gives teams direct control over the real-time agent architecture. The LiveKit worker supports VAD, multilingual turn detection, telephony-aware noise cancellation, interruptible first messages, preemptive generation, configurable STT/LLM/TTS models, per-agent prompts, webhooks, RAG, MCP tool access, and outbound per-recipient metadata overrides.

### 3. Cost And Scale Control

QuickVoice separates the platform from the vendors underneath it. Teams can operate their own Postgres, Redis, LiveKit, Twilio or Telnyx, object storage, vector database, and model provider accounts. The repo includes BullMQ queues for knowledge ingestion and outbound campaigns, Stripe metered usage hooks, and direct provider integration points so teams can reason about actual infrastructure costs instead of only accepting wrapper fees.

## Definitive Positioning Statement

For engineering-led teams who need AI phone agents without surrendering runtime control, data ownership, and provider economics, QuickVoice is open-source voice-agent infrastructure that lets them run, inspect, and extend the full calling stack. Unlike closed platforms such as Retell, Vapi, or Bland AI, QuickVoice exposes the console, API, LiveKit worker, database schema, telephony integrations, knowledge base pipeline, call logs, retention controls, and outbound campaign logic in one MIT-licensed repo. Teams get the convenience of a productized stack with the control of owned infrastructure.

## Messaging Guardrails

Use these claims:

- Open-source, MIT-licensed, self-hostable AI phone-agent infrastructure.
- LiveKit-powered runtime with Twilio and Telnyx telephony integration points.
- Inspectable data paths for call logs, recordings, transcripts, knowledge bases, MCP tools, auth, permissions, and retention.
- Bring-your-own providers for voice runtime, telephony, storage, model inference, vector search, and billing.
- Local evaluation through `task up:dev`; real calls require provider credentials.

Avoid these claims unless separate public evidence exists:

- HIPAA, SOC 2, ISO 27001, PCI, GDPR, or CCPA certification claims.
- Production benchmark, latency, uptime, customer-count, revenue, or compliance-status claims.
- "No setup", "production-ready in two minutes", or "fresh clone can place real calls".
- Broad native integration claims such as EHR, CRM, calendar, Zapier, or thousands of apps unless the integration is actually implemented in the repository.
- "Local LLM" or "open-source model" positioning for the default runtime.

## README And Website Gaps To Close

The README already states the core open-source and self-hosting narrative, but it should surface more code-backed strengths:

- Per-agent runtime config lookup by phone number or agent ID.
- Live-call RAG using Pinecone and Google embeddings.
- MCP marketplace/custom server connections with per-agent allowlisting and side-effect tool suppression.
- Privacy controls including zero-PII retention, default call-log PII redaction, retention jobs, secret encryption/references, and safe URL validation.
- Twilio/Telnyx number purchase, provider binding, LiveKit trunk binding, rollback behavior, outbound campaign queues, and usage metering hooks.

Some public web copy currently overstates what the repository proves. The safest correction is to align public claims around inspectable infrastructure, provider control, and self-hostability, then add stronger compliance, customer, latency, or managed-service claims only when backed by external evidence.
