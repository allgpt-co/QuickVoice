# Langfuse Evaluation Export

QuickVoice can export completed voice-call evaluations to Langfuse. The AI
runtime creates one Langfuse trace per completed call and sends each captured
call evaluation as a Langfuse score.

## What Gets Exported

- A `quickvoice.call` Langfuse agent observation for the completed call.
- Trace metadata such as call ID, organization ID, agent ID, direction, provider,
  duration, model names, RAG usage, transcript count, and evaluation count.
- Scores for each item in `evaluatedData`, using the `call_eval.` prefix by
  default. Boolean values are sent as Langfuse boolean scores, numbers as numeric
  scores, short strings as categorical scores, and longer text as text scores.
- `langfuseTraceId` in QuickVoice call-log metadata. If `LANGFUSE_PROJECT_ID` is
  set, QuickVoice also stores `langfuseTraceUrl`.

Transcript content is not exported by default. Set
`LANGFUSE_CAPTURE_TRANSCRIPTS=true` to include call transcripts in the Langfuse
trace output. Calls with `zero_pii_retention` never export transcript content,
even when transcript capture is enabled.

## Configuration

Set these variables in `apps/ai/.env`:

```env
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_PROJECT_ID=
LANGFUSE_ENVIRONMENT=development
LANGFUSE_CAPTURE_TRANSCRIPTS=false
LANGFUSE_SCORE_PREFIX=call_eval.
```

`LANGFUSE_PROJECT_ID` is optional. Add it when you want QuickVoice call details
to include a direct trace URL.

## Demo Flow

1. Configure the Langfuse environment variables above.
2. Start QuickVoice in development mode with the API, console, and AI worker.
3. In the console, open an agent and add a call evaluation in the Analysis tab,
   for example `qualified` with criteria `Caller asks for a product demo`.
4. Run a preview or test call and say something that satisfies the criterion.
5. End the call so the AI finalizer posts the call log.
6. Open the call details in QuickVoice and show `langfuseTraceId` or
   `langfuseTraceUrl` under Additional Metadata.
7. Open Langfuse and show the `quickvoice.call` trace plus the
   `call_eval.qualified` score.

The export is fail-open: if Langfuse is disabled, not configured, or temporarily
unavailable, QuickVoice still finalizes and posts the call log.
