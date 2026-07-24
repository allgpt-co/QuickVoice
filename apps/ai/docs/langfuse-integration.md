# Langfuse Evaluation & Observability Integration

This document describes how [Langfuse](https://github.com/langfuse/langfuse) is integrated into `apps/ai` to provide observability and evaluation capabilities for voice AI call sessions.

---

## 1. Overview

Langfuse acts as an evaluation and tracing layer for voice call sessions. For each call handled by the LiveKit agent worker:
- **Trace Lifecycle**: One trace is created per voice session (`voice_call`), sharing the call ID from the call-logging system.
- **RAG Spans**: Pinecone knowledge base queries are wrapped in a `knowledge_retrieval` span, capturing the query, top-k requested, latency, and retrieved context.
- **Tool Spans**: MCP tool executions and HTTP tool invocations are wrapped in `mcp_tool_call` or `http_tool_call` spans.
- **LLM Turns**: Model prompt inputs and response generations are recorded per conversation turn.
- **Quality Scores**: Automated call quality scores (`call_outcome` and `response_relevance`) are attached to each trace upon session completion.

---

## 2. Environment Variables

Add the following environment variables to your `.env.dev` (or production environment):

```bash
# Langfuse Observability Configuration
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
LANGFUSE_HOST=https://cloud.langfuse.com
```

> **Note**: If `LANGFUSE_PUBLIC_KEY` or `LANGFUSE_SECRET_KEY` are omitted or set to placeholder values, Langfuse tracing will automatically and safely fall back to an inactive state without interrupting call sessions.

---

## 3. Privacy & Zero-PII Compliance

`apps/ai` respects existing privacy controls configured for agents:
- When an agent has **`zero_pii_retention: true`** in its configuration:
  - Phone numbers in trace metadata are redacted to `[REDACTED_ZERO_PII]`.
  - User query text and retrieved Pinecone context in RAG spans are redacted to `[REDACTED_ZERO_PII]`.
  - Tool arguments and execution results are redacted to `[REDACTED_ZERO_PII]`.
  - Conversation turn prompts and responses are redacted to `[REDACTED_ZERO_PII]`.
  - Latency metrics, span structure, and scores remain intact for performance monitoring without storing sensitive PII data on external services.

---

## 4. Viewing Traces & Scores

1. Open your Langfuse Dashboard (Cloud or self-hosted instance at `LANGFUSE_HOST`).
2. Navigate to **Traces**.
3. Filter or search by `trace_id` (the call ID, e.g. `voice-...` or `call-...`) or metadata `agent_id`.
4. Inspect nested spans (`knowledge_retrieval`, `mcp_tool_call`, `http_tool_call`, `llm_turn`) and attached scores (`call_outcome`, `response_relevance`).
