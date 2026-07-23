# Langfuse Integration for QuickVoice

QuickVoice integrates with [Langfuse](https://langfuse.com) to provide full observability and evaluation for voice agent calls. Every call becomes a trace with detailed spans for LLM, STT, TTS, and tool operations.

## What is Langfuse?

Langfuse is an open-source LLM observability platform that helps you:
- **Trace** every LLM interaction (inputs, outputs, latency, cost)
- **Evaluate** call quality with custom scoring
- **Debug** issues by inspecting full conversation flows
- **Monitor** production performance with dashboards

## Quick Start

### 1. Get Langfuse credentials

**Option A: Langfuse Cloud (recommended for getting started)**
1. Sign up at https://cloud.langfuse.com
2. Create a new project
3. Go to Settings → API Keys → Create new key
4. Copy your Public Key and Secret Key

**Option B: Self-hosted with Docker**
```bash
docker compose --profile langfuse up -d
```
Then visit http://localhost:3100, create an account, and generate API keys.

### 2. Configure environment variables

Add these to your `apps/ai/.env` file:

```env
LANGFUSE_ENABLED=true
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key
LANGFUSE_HOST=https://cloud.langfuse.com
```

For self-hosted, use:
```env
LANGFUSE_HOST=http://localhost:3100
```

### 3. Install the dependency

```bash
cd apps/ai
pip install langfuse~=2.51
```

Or if using the requirements file:
```bash
pip install -r requirements.txt
```

### 4. Restart the AI worker

The Langfuse integration activates automatically when `LANGFUSE_ENABLED=true` and valid credentials are set.

## What Gets Traced

Each voice call creates a Langfuse trace containing:

| Span Type | What's Captured |
|-----------|----------------|
| `user-turn` | User speech transcriptions |
| `agent-turn` | Agent speech output |
| `llm-generation` | LLM prompts and completions |
| `stt-transcription` | Speech-to-text operations |
| `tts-synthesis` | Text-to-speech operations |
| `tool-*` | RAG lookups, HTTP tools, MCP tools |

### Trace Metadata

Each trace includes:
- Agent ID and configuration
- Call direction (inbound/outbound)
- Room name (session ID)
- Language, models used (LLM, STT, TTS)
- Call duration
- Shutdown reason

## Evaluation Scores

The integration supports adding evaluation scores to traces. Scores can be:
- **Numeric** (0-1): e.g., `call_quality: 0.85`
- **Categorical**: e.g., `task_completion: "success"`

Scores are recorded via the `record_call_evaluation` tool that the agent uses during calls when evaluation criteria are configured.

## API Endpoint

Check observability status:
```
GET /observability/status
```

Returns:
```json
{
  "langfuse_enabled": true,
  "host": "https://cloud.langfuse.com"
}
```

## Architecture

```
┌─────────────────────┐
│   Voice Call Room    │
│  (LiveKit Session)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│   QuickVoice AI     │────▶│      Langfuse       │
│   (main.py)         │     │   (Cloud or Self)   │
│                     │     │                     │
│  • CallTrace.start()│     │  • Traces           │
│  • span_user_turn() │     │  • Generations      │
│  • span_agent_turn()│     │  • Spans            │
│  • span_tool_call() │     │  • Scores           │
│  • trace.end()      │     │  • Dashboards       │
└─────────────────────┘     └─────────────────────┘
```

## Disabling Langfuse

Set `LANGFUSE_ENABLED=false` or remove the env var. The integration uses a no-op pattern — when disabled, all tracing calls are silently skipped with zero overhead.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No traces appearing | Verify `LANGFUSE_ENABLED=true` and check API keys |
| Connection errors in logs | Check `LANGFUSE_HOST` URL and network access |
| Missing spans | Ensure the call completes (trace.end() is called on shutdown) |
| Self-hosted DB errors | Run `docker compose --profile langfuse up -d` and check postgres is healthy |
