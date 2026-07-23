# Langfuse observability

QuickVoice can send one `quickvoice.voice_call` trace for each real call or
preview session. The integration records configuration and session startup,
transcript metadata, RAG retrievals, HTTP/MCP tools, finalization, and
deterministic post-call scores. Langfuse failures are fail-open and never block
the voice call.

## Architecture

`apps/ai/main.py` creates one `LangfuseCallObserver` per LiveKit job and passes
it through the existing `AgentSession`, `Assistant`, `TranscriptCollector`, and
unified finalization flow. `apps/ai/handlers/langfuse_handler.py` lazily creates
the Langfuse client and owns the root observation, child observations, scores,
flush, and shutdown behavior.

## Setup

Install the AI dependencies and configure `apps/ai/.env.dev`:

```sh
task deps:python
cp apps/ai/.env.dev.example apps/ai/.env.dev
```

```dotenv
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com
LANGFUSE_ENVIRONMENT=development
LANGFUSE_RELEASE=
LANGFUSE_SAMPLE_RATE=1.0
LANGFUSE_EVALUATION_ENABLED=true
```

`LANGFUSE_SAMPLE_RATE` accepts values from `0.0` to `1.0`. Set
`LANGFUSE_EVALUATION_ENABLED=false` to retain traces without post-call scores.
Never commit `.env.dev` or credentials.

## Local demo

```sh
task langfuse:demo
```

The demo creates a synthetic preview trace with one user turn, one assistant
turn, one successful RAG retrieval, one successful HTTP tool call, finalization,
and evaluation scores. It requires no LiveKit or telephony provider.

## Real call or preview verification

1. Configure Langfuse and the normal QuickVoice voice-provider credentials.
2. Start `task ai:api` and `task ai:worker`.
3. Start a preview from the console, or place/receive a configured voice call.
4. End the session normally.
5. In Langfuse, filter for trace name `quickvoice.voice_call` and confirm its
   call metadata, child observations, and scores.

## Privacy

Transcript text and RAG query text are not sent. Their observations contain
role, timestamp, character counts, result sizes, and other non-content metadata.
Tool arguments are reduced to keys and value types; results are reduced to type
and serialized size. Authorization headers, credentials, raw phone numbers,
and secret keys are excluded. Identifiers and metadata pass through QuickVoice
redaction and length limits. Zero-PII retention status is attached to the trace.

## Evaluation metrics

- `call_completed`: successful finalization
- `has_user_input` / `has_agent_response`: presence of each role
- `tool_success_rate`: successful tools divided by attempted tools
- `rag_success_rate`: retrievals returning context divided by attempts
- `conversation_turns`: user plus assistant turns
- `call_duration_seconds`: observed session duration
- `conversation_quality`: mean of five values between 0 and 1:
  non-empty assistant-response ratio, average assistant length capped at 120
  characters, response-after-user indicator, tool completion rate, and normal
  ending indicator. No requested tools contributes `1.0` only to the tool
  component as a neutral non-failure; `tool_success_rate` remains `0.0`.

## Troubleshooting

- No trace: confirm `LANGFUSE_ENABLED=true`, both keys, host, and sample rate.
- Trace without scores: confirm `LANGFUSE_EVALUATION_ENABLED=true` and end the
  session so finalization runs.
- Connection errors: verify the host and outbound HTTPS access. Calls continue
  because integration errors are caught and redacted.
- Demo shows `"langfuse_enabled": false`: the env file is missing, disabled, or
  lacks credentials.

## Assignment video screenshot checklist

- Environment variable names with values and secrets hidden
- Successful `task langfuse:demo` output
- `quickvoice.voice_call` root trace
- Transcript, RAG, tool, and finalization observations
- Deterministic scores including `conversation_quality`
- Real call or preview trace with model and environment metadata
