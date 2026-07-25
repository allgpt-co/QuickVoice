# ADR 001: Langfuse Observability & Evaluation Layer for Voice AI Sessions

**Status**: Proposed / Implemented  
**Date**: 2026-07-24  
**Author**: QuickVoice Engineering  
**Scope**: `apps/ai` (Python AI Service & LiveKit Worker)

---

## 1. Context & Problem Statement

QuickVoice powers real-time AI voice agents built on LiveKit, Pinecone RAG, and MCP/HTTP tool integrations. While standard application logs capture process execution, voice conversations present unique observability challenges:
- Difficulty measuring turn-taking latency across STT -> LLM -> TTS pipelines.
- Lack of visibility into Pinecone RAG chunk relevance and MCP tool payload parameters during active voice calls.
- Absence of structured evaluation scores to detect degraded agent quality, hallucinated answers, or call hangups.

We need an open-source, LLM-native observability and evaluation framework that integrates seamlessly into `apps/ai`, provides low-overhead session tracing, attaches quality evaluation scores, and strictly adheres to QuickVoice's zero-PII privacy controls.

---

## 2. Decision Rationale: Why Langfuse?

We evaluated **Langfuse** against alternative options:

| Criteria | Generic APM (Datadog/NewRelic) | Custom Logging | Langfuse |
|---|---|---|---|
| **LLM / Turn-level Native** | No (requires custom spans) | No | Yes (native Generation & Trace abstractions) |
| **RAG & Tool Execution** | Complex tracing setup | Fragile JSON schemas | Native Span and Tool execution support |
| **Evaluation / Scoring API** | Manual metrics | Custom DB tables | Native Scores API (`langfuse.score`) |
| **Self-Hostable & Open Source** | No (closed SaaS) | Yes | Yes (Docker / Cloud support) |

**Decision**: Integrate `langfuse-python` as the primary observability and evaluation layer inside `apps/ai`.

---

## 3. Architecture & Design

### 3.1 Singleton Client Pattern
We introduced `utils/langfuse_client.py` adhering to existing client patterns in `apps/ai` (e.g. `utils/pinecone_client.py`):
- Environment keys (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`) are loaded dynamically.
- Missing credentials or placeholder strings (`pk-lf-xxxx`) fail open into a graceful inactive state (`client = None`), ensuring local development and offline test suites execute without errors.

### 3.2 Trace Hierarchy
For each LiveKit call session, a `LangfuseCallTracer` manages a hierarchical trace tree:

```
voice_call [Trace] (id = call_id)
 ├── knowledge_retrieval [Span] (query, top_k, retrieved chunks, latency)
 ├── mcp_tool_call / http_tool_call [Span] (tool_name, input_args, output, latency)
 └── llm_turn [Generation] (prompt, model, output_response, token_usage)
```

### 3.3 Worker Process Exit & Flush Timing
LiveKit workers run asynchronously across room connections. When a call ends (participant hangup or room disconnect):
1. Final call metadata (duration, outcome status) is updated on the trace.
2. Automated evaluation scores (`call_outcome` and `response_relevance`) are attached.
3. `tracer.finalize()` invokes `client.flush()` within the `unified_shutdown_hook` BEFORE process termination. This guarantees event batches are safely flushed to the Langfuse collector over HTTP without blocking turn latency during active audio streaming.

---

## 4. Privacy & Security Architecture Alignment

QuickVoice provides agent-level privacy controls (`zero_pii_retention`). Langfuse tracing strictly respects this flag:

- **When `zero_pii_retention: true`**:
  - Customer phone numbers in trace metadata are set to `[REDACTED_ZERO_PII]`.
  - User turn prompts, assistant responses, Pinecone query strings, retrieved chunks, and tool execution payloads are replaced with `[REDACTED_ZERO_PII]`.
  - Spans, latency metrics, call outcome status, and quality scores remain visible for performance monitoring without leaking PII to third-party collectors.

---

## 5. Evaluation & Quality Scoring

Each finalized call trace automatically attaches evaluation scores using the Langfuse Scores API:
1. **`call_outcome`**: Binary score (`1.0` for completed sessions, `0.0` for early hangups/errors).
2. **`response_relevance`**: Heuristic quality signal derived from session metrics, ready to be supplemented with LLM-as-judge scoring pipelines.

---

## 6. Tradeoffs & Future Work

- **Network Overhead**: Tracing events are queued asynchronously in memory and flushed on shutdown, adding near-zero overhead (<1ms) to active conversation audio turns.
- **Future Enhancements**: Extend evaluation to run offline LLM-as-judge background tasks (e.g. evaluating agent empathy, intent fulfillment) and build automated regression testing against golden reference traces.
