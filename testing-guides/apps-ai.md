a Python AI service, LiveKit worker, and RAG runtime Testing Guide

## Intern Testing Orientation

Test only `apps/ai` for commit `3489a213063743d1c3a5a0465c327150d847097a`. This module runs the Python FastAPI AI service, the LiveKit voice worker, knowledge-base ingestion, RAG retrieval, MCP tool execution from calls, call recording, and call-log delivery back to the Node server.

Use concrete pass/fail results. If a scenario needs real LiveKit, Pinecone, Google embeddings, S3, Twilio/Telnyx, Smithery, or seeded QuickVoice accounts and you do not have those credentials, mark it **Blocked**, not passed.

Important scope files:

- `apps/ai/api.py`
- `apps/ai/main.py`
- `apps/ai/handlers/*.py`
- `apps/ai/utils/*.py`
- `apps/ai/tests/*.py`
- `apps/ai/requirements.txt`
- `apps/ai/Dockerfile`
- `apps/ai/.env.dev.example`
- `apps/ai/livekit.toml`

## Module Overview

`apps/ai` has two runtime surfaces:

- FastAPI service in `api.py`, started with `python main.py api`, defaulting to `AI_API_PORT=5555`.
- LiveKit worker in `main.py`, started through the LiveKit agents CLI with `python main.py dev` locally or `python main.py start` in combined service mode.

Primary FastAPI routes:

- `GET /health`: unauthenticated health check.
- `GET /agents/{agent_id}/config`: fetches normalized runtime config from the server.
- `POST /kb/process`: creates an async KB ingestion job.
- `GET /kb/jobs/{job_id}`: reads KB job state.
- `DELETE /kb/jobs/{job_id}`: cancels queued/running KB jobs.
- `POST /kb/jobs/{job_id}/retry`: retries failed KB documents.
- `DELETE /kb/{agent_id}/{kb_id}`: deletes Pinecone vectors for one KB source in one agent namespace.

Core dependencies and providers:

- LiveKit Agents runtime: `livekit-agents`, `livekit-plugins-noise-cancellation`, `silero`.
- FastAPI/uvicorn for the AI API.
- Pinecone for KB vector storage.
- Google Generative AI `text-embedding-004` for KB and RAG embeddings.
- PyMuPDF, python-docx, openpyxl, xlrd, httpx, BeautifulSoup for KB ingestion.
- S3-compatible storage for call recordings.
- QuickVoice Node server at `SERVER_API_URL`, using `INTERNAL_API_KEY`.

## Architecture And Data Flow Testing

1. **Internal API boundary**

   Data flow: caller -> `api.py` middleware -> `utils.auth.verify_internal_headers`.

   Pass:
   - `GET /health` works without auth and returns `{"ok": true, "service": "ai"}`.
   - Every non-health route rejects missing or wrong credentials with `401`.
   - Missing `INTERNAL_API_KEY` outside `AI_ALLOW_INSECURE_DEV_MODE=true` fails closed with a startup/runtime error.

   Fail:
   - Any KB, config, or delete route works without `x-internal-key` or `Authorization: Bearer`.
   - `AI_ENV=development` alone bypasses auth. It must not.

2. **Runtime config flow**

   Data flow: LiveKit room/participant metadata -> `worker_handler.build_call_context` -> `config_handler.get_config` -> Node server routes:
   - `GET /api/v1/agents/number-config/{phoneNumber}`
   - fallback `GET /api/v1/agents/internal-config/{agentId}`

   Pass:
   - Phone-number lookup is attempted first when `agent_number` exists.
   - Agent-id lookup is used when no number exists or number lookup returns 404.
   - Config normalizes `llmModel`, `sttModel`, `ttsModel`, `voiceId`, `agent_language`, `use_rag`, `store_call_audio`, `zero_pii_retention`, `retentionDays`, and enabled `mcpConnections`.
   - Runtime logs redact prompts, secrets, webhook URLs, phone numbers, transcript text, and tokens.

   Fail:
   - Runtime silently uses default config in non-dev mode.
   - Config from one organization is returned to another tenant.
   - Provider/model strings are malformed, for example `gpt-4o-mini` not normalized to `openai/gpt-4o-mini`.

3. **LiveKit worker call flow**

   Data flow: LiveKit job -> `entrypoint()` -> `AgentSession` with STT/LLM/TTS/VAD/turn detector -> first message -> optional recording -> finalization.

   Pass:
   - Inbound room names like `+15551230000_+15550001111` produce `from_number=+15550001111`, `to_number=+15551230000`, `direction=inbound`.
   - SIP metadata keys `sip.phoneNumber`, `sip.trunkPhoneNumber`, and `sip.callID` override room parsing.
   - Outbound metadata flips `from_number`/`to_number`, keeps `outbound_id`, and applies outbound `first_message`, `system_prompt`, `language`, `voice_id`, and `dynamic_variables`.
   - `speak_first_message` calls `session.say(..., allow_interruptions=True)` only when a non-empty first message exists.
   - Shutdown finalization posts the call log only once, even if both LiveKit shutdown callback and participant disconnect fire.

   Blocked:
   - Real audio/STT/LLM/TTS validation without LiveKit and model-provider credentials.

4. **KB ingestion flow**

   Data flow: server KB worker -> `POST /kb/process` -> in-memory job state -> download/extract -> chunk -> Google embeddings -> Pinecone upsert in namespace `agentId`.

   Pass:
   - Invalid payloads return structured `detail.code` values such as `KB_AGENT_ID_REQUIRED`, `KB_ORGANIZATION_ID_REQUIRED`, `KB_DOCUMENTS_REQUIRED`, or `KB_DOCUMENT_LIMIT_EXCEEDED`.
   - URL ingestion blocks `file:`, `ftp:`, localhost, loopback, private IPs, metadata IPs, URL credentials, unresolved hosts, and non-HTML URL content.
   - File ingestion requires `presignedUrl`.
   - Supported file source types are `PDF`, `DOCX`, `XLSX`, `XLS`, `TXT`, `CSV`; `URL` uses HTML extraction.
   - Existing vectors for a `kbId` are deleted before replacement.
   - Progress moves through queued/running stages and ends as `succeeded`, `partial_failed`, `failed`, or `canceled`.

   Fail:
   - Pinecone upsert uses a namespace other than the target `agentId`.
   - Private network URLs are downloaded.
   - A document over `KB_MAX_CHUNKS_PER_DOCUMENT` reaches embedding or upsert.

   Regression check:
   - Current server worker `apps/server/src/workers/kb.worker.ts` expects `POST /kb/process` to return `{ success: true, processed: [...] }`.
   - Current AI route returns an async job object with `jobId`, `statusUrl`, and `documents`.
   - Release should fail until the server/AI KB contract is aligned or both sides are intentionally migrated.

5. **RAG retrieval flow**

   Data flow: user turn -> `Assistant.on_user_turn_completed` or `search_knowledge_base` tool -> Google query embedding -> Pinecone query with namespace `agentId` -> citation text injected into context.

   Pass:
   - RAG is skipped when `use_rag=false`.
   - Empty matches return no context or `"No matching knowledge base context found."`.
   - Provider failures raise `RagRetrievalError` internally and instruct the agent not to invent an answer.
   - Citations include document name, chunk id, optional page/sheet, and score.

   Fail:
   - RAG retrieves from another agent namespace.
   - Provider errors are treated as “no matches”.
   - Agent answers KB-dependent questions without retrieval when `use_rag=true`.

6. **Call logging flow**

   Data flow: finalizer -> `calllog_handler.build_call_log_payload` -> `POST {SERVER_API_URL}/calls` -> server call-log ingest.

   Pass:
   - Payload includes `organizationId`, `userId`, UUID `agentId`, `callId`, UTC `startTime`/`endTime`, `durationSeconds`, `direction`, `status=COMPLETED`, `recordingSid`, normalized transcripts, numbers, provider, extracted/evaluated data.
   - Headers include `Authorization: Bearer $INTERNAL_API_KEY`, `x-organization-id`, and `x-user-id` when available.
   - Failed delivery retries, then writes durable JSON to `AI_CALL_LOG_QUEUE_DIR` or `/tmp/quickvoice-ai-calllogs`.
   - Queue flush posts saved files, deletes successful files, and moves records to `dead-letter` after 5 failed attempts.

   Fail:
   - Duplicate call logs are posted for one call.
   - Zero-PII calls include transcript text or recording path.
   - Queue files contain unsanitized filenames.

7. **Langfuse observability and tracing**

   Data flow: agent worker -> Langfuse API.

   Pass:
   - Worker initializes Langfuse client and registers trace with session/room name as `session_id`.
   - Tool calls and LLM generation spans are automatically wrapped with `@observe` decorator, linking them to the parent trace.
   - Trace metadata captures `agent_id`, `provider`, and `direction`.
   - Client successfully flushes traces on worker shutdown or session finalization.

   Fail:
   - Langfuse keys missing or empty (when tracing is expected) fails to initialize telemetry without crashing the agent.
   - Generation / tool traces do not map to the correct user call session.

## Setup And Required Services

Minimum local setup from repo root:

```sh
task env:dev
task deps:python
```

To run the full local stack:

```sh
task up:dev
```

Useful individual commands:

```sh
task doctor
task docker:up
task db:migrate
task db:seed -- --email tester@example.com
task ai:api
task ai:worker
```

AI API only:

```sh
cd apps/ai
. .venv/bin/activate
. .env.dev
python main.py api
```

Expected local URLs:

- AI API health: `http://localhost:5555/health`
- Server health: `http://localhost:5000/api/v1/health`
- Server docs: `http://localhost:5000/api/v1/docs`
- Console: `http://localhost:3000`

Required AI environment variables proven from code/templates:

- `AI_API_HOST`
- `AI_API_PORT`
- `AI_API_RELOAD`
- `SERVER_API_URL`
- `INTERNAL_API_KEY`
- `AI_ALLOW_INSECURE_DEV_MODE`
- `AI_LOG_LEVEL`
- `AI_LOG_DIAGNOSE`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_AGENT_NAME`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`
- `AWS_REGION`
- `S3_BUCKET_NAME`
- legacy aliases: `ACCESS_KEY`, `SECRET_ACCESS_KEY`, `REGION`, `BUCKET`
- `PINECONE_API_KEY`
- `PINECONE_INDEX`, default `quickvoice-kb`
- `GOOGLE_EMBEDDING_API_KEY` or `GOOGLE_API_KEY`
- `KB_MAX_DOWNLOAD_BYTES`, default `10485760`
- `KB_MAX_CHUNKS_PER_DOCUMENT`, default `500`
- `KB_MAX_DOCUMENTS_PER_JOB`, default `50`
- `KB_ALLOWED_HOSTS`
- `KB_AGENT_BUDGETS_JSON`
- `AI_CALL_LOG_QUEUE_DIR`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_HOST`

Related server environment variables to verify during integration:

- `AI_API_URL`, default server worker target `http://localhost:5555`
- `INTERNAL_API_KEY`
- `KB_OPS_URL`
- `CALL_LOG_PII_REDACTION`
- `MCP_LOG_RETENTION_DAYS`
- `FAILED_KB_RETENTION_DAYS`

## Automated Test Commands

Run all Python tests:

```sh
cd apps/ai
. .venv/bin/activate
python -m pytest tests -q
```

Lower-write test form for read-only-style verification:

```sh
cd apps/ai
. .venv/bin/activate
PYTHONDONTWRITEBYTECODE=1 python -m pytest -p no:cacheprovider tests -q
```

Root CI command for Python only:

```sh
pnpm ci:python
```

Targeted commands:

```sh
cd apps/ai
. .venv/bin/activate
python -m pytest tests/test_api.py -q
python -m pytest tests/test_config_handler.py -q
python -m pytest tests/test_worker_helpers.py -q
python -m pytest tests/test_calllog_handler.py -q
python -m pytest tests/test_finalization_handler.py -q
python -m pytest tests/test_livekit_handler.py -q
python -m pytest tests/test_privacy_handler.py -q
python -m pytest tests/test_security_controls.py -q
python -m pytest tests/test_kb_handler.py -q
python -m pytest tests/test_rag_handler.py -q
python -m pytest tests/test_rag_runtime.py -q
python -m pytest tests/test_rag_integration.py -q
python -m pytest tests/test_mcp_handler.py -q
```

Docker validation:

```sh
scripts/ci-docker-build.sh
```

AI image only:

```sh
docker buildx build \
  --file apps/ai/Dockerfile \
  --build-arg PREINSTALL_CPU_TORCH=true \
  --build-arg SKIP_MODEL_DOWNLOAD=true \
  --tag quickvoice-ai:ci \
  --load \
  apps/ai
```

Pass:
- All selected tests exit `0`.
- Docker build completes with Python 3.12 slim image, non-root `appuser`, exposed port `5555`, and no test files copied into the final image.

Fail:
- Any unit test fails.
- Docker build downloads CUDA Torch during CI validation despite `PREINSTALL_CPU_TORCH=true`.
- Import failures occur after installing `apps/ai/requirements.txt`.

Blocked:
- Dependency installation cannot run because PyPI/network access is unavailable.
- Docker daemon is unavailable for image validation.

## Functional Test Cases

1. **Health endpoint**

   Steps:
   ```sh
   curl -i http://localhost:5555/health
   ```

   Pass: HTTP 200 with `{"ok":true,"service":"ai"}`.

   Fail: Requires auth, returns non-JSON, or returns non-200 while the process is running.

2. **Internal auth enforcement**

   Steps:
   ```sh
   curl -i http://localhost:5555/agents/agent_123/config
   curl -i -H 'x-internal-key: wrong' http://localhost:5555/agents/agent_123/config
   ```

   Pass: both return HTTP 401.

   Fail: either request reaches config loading.

3. **Authorized config fetch**

   Steps:
   ```sh
   curl -i \
     -H 'x-internal-key: dev-internal-key-change-me' \
     http://localhost:5555/agents/agent_123/config
   ```

   Pass: with a running server and valid seeded `agent_123`, response is HTTP 200 and fields are normalized to AI runtime keys.

   Blocked: no seeded agent/server session.

   Fail: wrong tenant config is returned, prompts/secrets appear in logs, or the route works without `SERVER_API_URL`.

4. **KB validation without vendor credentials**

   Steps:
   ```sh
   curl -i -X POST http://localhost:5555/kb/process \
     -H 'content-type: application/json' \
     -H 'x-internal-key: dev-internal-key-change-me' \
     -d '{"agentId":"","organizationId":"org_123","documents":[]}'
   ```

   Pass: HTTP 400 with structured `detail.code`, not a Python traceback.

   Fail: HTTP 500 or unstructured error.

5. **KB private URL rejection**

   Steps:
   ```sh
   curl -s -X POST http://localhost:5555/kb/process \
     -H 'content-type: application/json' \
     -H 'x-internal-key: dev-internal-key-change-me' \
     -d '{"agentId":"agent_smoke","organizationId":"org_smoke","documents":[{"kbId":"kb_private","name":"Private URL","sourceType":"URL","url":"http://127.0.0.1/admin"}]}'
   ```

   Then poll `GET /kb/jobs/{jobId}`.

   Pass: job ends `failed`, document code is `KB_URL_PRIVATE_HOST`, progress is 100%, and no embedding/Pinecone credentials are needed.

   Fail: request downloads localhost/private URL or job never reaches terminal state.

6. **KB document budget**

   Setup: start AI with `KB_MAX_DOCUMENTS_PER_JOB=1`.

   Steps: submit two documents to `POST /kb/process`.

   Pass: HTTP 413 with `detail.code=KB_DOCUMENT_LIMIT_EXCEEDED`.

   Fail: job is accepted or background processing starts.

7. **KB cancel**

   Steps: create a KB job, then immediately call:

   ```sh
   curl -i -X DELETE \
     -H 'x-internal-key: dev-internal-key-change-me' \
     http://localhost:5555/kb/jobs/JOB_ID
   ```

   Pass: queued docs become `canceled`, code `KB_JOB_CANCELED`, progress processed count equals total.

   Fail: cancel returns success but job keeps processing.

8. **KB retry**

   Steps: create a job with one success and one failure using a test/stub environment, then call:

   ```sh
   curl -i -X POST \
     -H 'x-internal-key: dev-internal-key-change-me' \
     http://localhost:5555/kb/jobs/JOB_ID/retry
   ```

   Pass: new job includes only failed documents.

   Fail: successful documents are requeued, or retry is allowed when no failed documents exist.

9. **RAG runtime**

   Pass:
   - Agent with `use_rag=true` exposes `search_knowledge_base`.
   - `on_user_turn_completed` injects context after a user asks a KB-dependent question.
   - Provider failure injects an unavailable-system message and does not invent an answer.

   Blocked:
   - Real Pinecone/Google retrieval without provider credentials.

   Fail:
   - RAG runs when disabled or with missing `agent_id`.

10. **MCP tool runtime**

   Pass:
   - Only `CONNECTED` connections appear in tool instructions.
   - Read-only tools appear.
   - `requiresConfirmation`, `sideEffect`, `write`, `mutation`, and `side_effect` tools are hidden/rejected.
   - `arguments_json` over 8192 bytes is rejected.
   - Output is redacted and truncated above 4000 chars.

   Fail:
   - A voice call can execute a side-effect MCP tool without trusted confirmation.
   - Unknown connections/tools are executed.

11. **Call finalization and privacy**

   Pass:
   - Finalizer posts one call log only once.
   - `zero_pii_retention=true` sends `transcripts=[]`, `recordingSid=""`, and metadata flags.
   - `store_call_audio=false` skips LiveKit recording.
   - Failed call-log delivery creates a queue file and emits `call_log_delivery` metric with `status=queued`.

   Fail:
   - Transcript text or audio path is retained for zero-PII calls.
   - Queue retry loses payloads.

12. **Recording**

   Pass:
   - Recording path format is `Voice-agents/Recordings/{recording_id}.ogg`.
   - AWS standard env vars take precedence over legacy aliases.
   - Missing recording storage config logs a warning and does not crash the call.

   Blocked:
   - Real LiveKit egress/S3 upload without LiveKit and S3 credentials.

13. **Langfuse tracing validation**

    Setup:
    - Configure `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_HOST` in `apps/ai/.env`.
    - Set `PYTHONUNBUFFERED=1`.

    Steps:
    1. Start FastAPI API Server and LiveKit worker in separate terminals.
    2. Trigger a simulated call using the smoke test script:
       ```sh
       python scripts/phase2d_voice_smoke.py --probe-wav mock_probe.wav
       ```
    3. Access the Langfuse dashboard.

    Pass:
    - A trace named `voice-agent-session` appears in the Langfuse dashboard.
    - The trace is associated with the correct `session_id` (matching the LiveKit room name).
    - Metadata maps to the correct `agent_id`, `provider`, and call `direction`.
    - Spans are generated for tool execution (like Pinecone search) and LLM generations with nested parameters.

    Fail:
    - The agent worker hangs or crashes due to Langfuse API errors or missing credentials.
    - No traces are sent, or nested spans are missing from the session trace.

## SaaS Business And Operations Test Cases

1. **Tenant boundaries**

   Pass:
   - Runtime config from the server includes the correct `organizationId`.
   - KB vectors are stored under namespace `agentId`.
   - Server-side KB and call-log APIs filter by `organizationId`.
   - Call logs and transcripts from another org are not visible through the console/API.

   Fail:
   - Any AI route can retrieve or delete another tenant’s data using only guessed IDs.

2. **RBAC**

   Roles proven in `apps/server/src/lib/permissions.ts`:
   - `owner`: full access.
   - `admin`: full custom-resource access.
   - `member`: read-mostly; can create/read outbound calls; cannot mutate agent config, KB, tools, secrets, or call-log deletes.

   Pass:
   - Owner/admin can configure agents and create/delete KB sources.
   - Member can read agents, KB, call logs, and tools but cannot create/delete KB or update agent config.
   - AI internal routes remain server-to-server only and do not accept frontend cookies as authorization.

   Blocked: no seeded owner/admin/member accounts.

3. **Onboarding empty states**

   Pass:
   - With no agents, the KB upload dialog shows “No agents found. Create an agent first before adding knowledge sources.”
   - Agent Knowledge tab shows “No documents attached.”
   - Calls pages show empty states without console errors.

   Fail:
   - User can submit KB without an agent.
   - Empty states look like errors.

4. **Billing and usage controls**

   Proven behavior:
   - Agent configuration defaults include call/conversation limits in the server model.
   - `apps/ai` does not enforce billing plans or usage caps directly.

   Pass:
   - Product owner confirms billing enforcement is outside `apps/ai`, or an upstream server gate blocks usage before AI work starts.
   - AI budget envs (`KB_MAX_*`, `KB_AGENT_BUDGETS_JSON`) prevent runaway KB cost.

   Blocked:
   - No billing test account or Stripe/test subscription setup.

   Fail:
   - Release claims AI enforces plan limits when only server/default config fields exist.

5. **Support handoff and auditability**

   Pass:
   - Completed calls produce server call logs visible at `/calls`.
   - Server audit event `call_log.ingested` is recorded for internal ingest.
   - MCP execution produces server audit/action logging for `mcp.tool.executed`.
   - Logs redact phone numbers, SSNs, prompts, webhooks, transcript content, tokens, and auth headers.

   Fail:
   - Support cannot trace a failed call from LiveKit room/call ID to queued call-log payload.
   - Logs expose customer PII.

6. **Retention**

   Pass:
   - `zero_pii_retention` prevents transcript/audio delivery from AI.
   - `retention_days` is included in call-log metadata when present.
   - Server retention behavior is verified separately for transcripts, recordings, MCP logs, and failed KB rows.

   Blocked:
   - No retention worker/schedule access.

## Integration And API Test Cases

1. **AI API route contract**

   Validate these routes with `x-internal-key: $INTERNAL_API_KEY`:

   - `GET /agents/{agent_id}/config`
   - `POST /kb/process`
   - `GET /kb/jobs/{job_id}`
   - `DELETE /kb/jobs/{job_id}`
   - `POST /kb/jobs/{job_id}/retry`
   - `DELETE /kb/{agent_id}/{kb_id}`

   Pass: documented status codes and JSON shapes match tests in `apps/ai/tests/test_api.py`.

   Fail: auth, status, or response shape differs without corresponding server/console updates.

2. **Server runtime config API**

   AI calls:
   - `GET {SERVER_API_URL}/agents/number-config/{encoded_number}`
   - `GET {SERVER_API_URL}/agents/internal-config/{agent_id}`

   Pass:
   - Header is `Authorization: Bearer $INTERNAL_API_KEY`.
   - Server returns runtime config with organization/user/phone/provider/tools/MCP fields.
   - AI normalizes and uses this config.

   Blocked: no running server with seeded agent/number.

3. **Server call-log ingest**

   AI calls:
   - `POST {SERVER_API_URL}/calls`

   Required headers:
   - `Authorization: Bearer $INTERNAL_API_KEY`
   - `Content-Type: application/json`
   - `x-organization-id`
   - `x-user-id` when user id is present

   Pass:
   - Server returns created call log.
   - Console `/calls` shows the new row.
   - `/calls/{callId}/transcripts` shows normalized transcript rows when zero-PII is off.

   Fail:
   - Server rejects valid AI payloads because `agentId` is not UUID, `userId` is missing, or status/provider enums do not match.

4. **KB server-to-AI contract**

   Server worker calls:
   - `POST ${AI_API_URL}/kb/process`

   Current contract risk:
   - Server expects synchronous `{success:true, processed:[...]}`.
   - AI returns async `{success:true, jobId, statusUrl, status, progress, documents}`.

   Pass:
   - Contract is updated and covered by integration test, or server worker polls `statusUrl` until terminal state.

   Fail:
   - Server marks KB rows `ERROR` because it receives no `processed` array from AI.

5. **KB deletion cleanup**

   AI exposes:
   - `DELETE /kb/{agent_id}/{kb_id}`

   Server cleanup currently optionally calls:
   - `POST {KB_OPS_URL}/delete`

   Pass:
   - `KB_OPS_URL` points to a real compatible cleanup service, or server is updated to call AI’s existing delete route.
   - Pinecone vectors for only the target `kbId` and `agentId` are removed.

   Fail:
   - Deleting a KB row in the console leaves stale Pinecone vectors.

6. **MCP execution**

   AI calls:
   - `POST {SERVER_API_URL}/mcp/connections/{connection_id}/tools/{tool_name}/execute`

   Payload:
   - `organizationId`, `userId`, `agentId`, `callId`, `arguments`

   Pass:
   - Only attached, connected, read-only tools execute.
   - Server logs result/error and tenant checks use the organization context.

   Blocked:
   - No Smithery/MCP test connection.

7. **LiveKit egress and telephony**

   Pass:
   - Inbound Twilio/Telnyx call creates LiveKit room with metadata that AI parses correctly.
   - Outbound call metadata applies first-message/prompt/dynamic variable overrides.
   - Participant disconnect triggers one final call log.

   Blocked:
   - No LiveKit SIP trunk or telephony provider credentials.

## Non-Functional Test Cases

1. **Performance**

   Pass:
   - KB rejects oversized downloads via `KB_MAX_DOWNLOAD_BYTES`.
   - KB rejects excessive chunks before embedding.
   - Embeddings batch in groups of 100.
   - Pinecone upsert batches in groups of 100.
   - RAG `top_k` defaults to 5 and does not retrieve unbounded context.
   - MCP output is capped at 4000 serialized chars.

   Fail:
   - Large documents reach provider calls after budget failure.
   - Voice turn latency increases because RAG runs when disabled.

2. **Reliability and recovery**

   Pass:
   - Call logs retry and queue after repeated server failure.
   - Queue flush on next call startup posts old payloads.
   - Dead-lettering occurs after 5 failed flush attempts.
   - Recording startup failure logs a warning and does not end the call.
   - RAG provider failure tells the assistant the KB is temporarily unavailable.

   Fail:
   - Provider failure crashes the worker.
   - Queued call logs are lost on retry.

3. **Concurrency**

   Pass:
   - `CallFinalizer` lock prevents duplicate posts.
   - KB job lock keeps progress consistent.
   - Cancel during extraction/chunking/embedding/indexing marks remaining docs canceled.
   - Multiple KB jobs do not overwrite each other’s `jobId`.

   Fail:
   - Duplicate finalization creates duplicate call-log rows.
   - One KB job changes another job’s documents.

4. **Data integrity**

   Pass:
   - Transcript roles normalize `assistant` to `agent`.
   - Unknown transcript roles default safely to `agent`.
   - Timestamps normalize to UTC `Z`.
   - Negative durations clamp to `0`.
   - Required payload fields raise `ValueError` before posting incomplete call logs.

   Fail:
   - Invalid call-log payload reaches server ingest.

5. **Compatibility and packaging**

   Pass:
   - Python 3.12 environment installs `apps/ai/requirements.txt`.
   - Dockerfile builds with `PREINSTALL_CPU_TORCH=true` and `SKIP_MODEL_DOWNLOAD=true`.
   - No tests are copied into the final AI Docker image due `.dockerignore`.
   - `python main.py api`, `python main.py dev`, `python main.py start`, and Docker `CMD ["python","main.py","serve"]` are understood by operators.

   Fail:
   - Missing `pytest` in local/CI setup prevents test execution.
   - Dependency ranges pull incompatible FastAPI/LiveKit/Pinecone versions.

## UX, UI, Accessibility, And Compatibility Testing

`apps/ai` has no direct browser UI. Validate user-facing behavior through `apps/console` surfaces that consume AI outcomes:

- `/kb`
- `/agents/{agentId}` Knowledge tab
- `/agents/{agentId}` Advanced tab
- `/calls`
- `/calls/{callId}`
- `/dashboard`

1. **Knowledge base UI**

   Pass:
   - `/kb` shows loading skeletons, empty state, error state with Retry, and populated table.
   - “Add document” dialog supports URL and File tabs.
   - File picker accepts PDF, TXT, CSV, DOCX, XLSX, XLS.
   - Missing name, missing URL, missing file, or missing agent shows a toast and does not submit.
   - Status chips clearly show Processing, Active, and Error.
   - Delete action uses a confirmation dialog and pending “Deleting…” state.
   - Mobile card view and desktop table both show type, name, status, agent, uploaded date, indexed date, and actions.

   Fail:
   - Upload can submit without agent.
   - Status remains Processing forever after AI job failure without operator-visible error.

2. **Agent Advanced tab**

   Pass:
   - “Enable RAG” and “Preemptive generation” switches save through `/agents/{agentId}/config`.
   - Save button is disabled when form is clean/loading.
   - Pause, Resume, and Delete actions show appropriate pending/destructive states.

   Fail:
   - RAG switch appears saved but runtime config still returns `use_rag=false`.

3. **Agent Knowledge tab**

   Pass:
   - Shows attached documents assigned to the agent.
   - Empty state tells user to upload in Knowledge Base and assign to agent.
   - Status badges match server KB status.

   Fail:
   - Documents from another agent/org appear.

4. **Calls UI**

   Pass:
   - `/calls` shows loading skeletons, error retry, filters, column picker, pagination, status, direction, agent, duration, and delete confirmation.
   - `/calls/{callId}` shows recording player or “No recording available,” transcript or “No transcript captured,” extracted data, and call metadata.
   - Zero-PII calls show no transcript and no recording.

   Fail:
   - Recording player appears for empty `audioRecordingPath`.
   - Deleted calls remain visible after refresh.

5. **Accessibility and compatibility**

   Pass:
   - Buttons have accessible names where icons are used, for example “Row actions,” “First page,” “Previous page,” “Play recording.”
   - Dialogs trap focus and can be dismissed with Cancel/Escape.
   - Keyboard-only users can upload, switch tabs, paginate, delete, and play/pause recordings.
   - Pages work at mobile and desktop breakpoints without clipped table/dialog content.
   - Chrome, Firefox, and Safari can render the console pages; audio playback may be blocked until user interaction, which is acceptable.

   Fail:
   - Icon-only controls have no label.
   - Dialog controls cannot be reached by keyboard.

## Security, Privacy, And Compliance Checks

1. **Internal auth**

   Pass:
   - `verify_internal_headers` accepts exact `x-internal-key` or `Authorization: Bearer`.
   - Comparison uses constant-time `hmac.compare_digest`.
   - Missing key fails outside explicit `AI_ALLOW_INSECURE_DEV_MODE=true`.

   Fail:
   - Any non-health route accepts no auth.

2. **SSRF protection**

   Pass:
   - KB ingestion rejects local/private/reserved/multicast/unspecified/link-local hosts.
   - Host allowlist `KB_ALLOWED_HOSTS` is honored.
   - Redirects are revalidated.
   - URLs with credentials are rejected.

   Fail:
   - `169.254.169.254`, `127.0.0.1`, or `localhost` is fetched.

3. **Sensitive logging**

   Pass:
   - `redact_sensitive` masks phone numbers, SSNs, auth headers, API keys, secrets, tokens, passwords, prompts, transcripts, messages, content, variables, and webhooks.
   - Metrics and provider errors use redacted payloads.

   Fail:
   - Logs contain raw phone numbers, transcript text, prompts, webhooks, or bearer tokens.

4. **Customer data retention**

   Pass:
   - `zero_pii_retention=true` disables recording and transcript delivery.
   - `store_call_audio=false` skips LiveKit recording.
   - Retention days are included in call metadata for downstream retention.

   Fail:
   - Audio or transcripts are stored when zero PII is enabled.

5. **MCP tool safety**

   Pass:
   - Read-only tools only.
   - Side-effect tools require trusted confirmation and are not exposed to the voice agent.
   - Tool arguments are size-limited and result previews are redacted/truncated.

   Fail:
   - Voice agent can send email, mutate CRM, or perform write actions through MCP without confirmation.

6. **Tenant isolation**

   Pass:
   - Server APIs use organization-scoped filters.
   - AI RAG uses the intended `agentId` namespace.
   - Manual cross-org attempts return 403/404/empty data.

   Fail:
   - Agent A can retrieve Agent B’s KB context.

## Edge Cases And Failure Modes

- Missing `INTERNAL_API_KEY`: API startup fails unless explicit dev mode is set.
- Missing `SERVER_API_URL`: config/call-log/MCP routes fail closed.
- Missing `PINECONE_API_KEY`: RAG/KB vector operations fail and should surface as structured errors or blocked checks.
- Missing Google embedding key: embedding fails; RAG should not invent an answer.
- Missing LiveKit env: recording start fails gracefully; real worker is blocked.
- Invalid LiveKit metadata JSON: `parse_metadata` returns `{}`.
- Room name without underscore: phone numbers are `None` until metadata/config fills them.
- No participant within 10 seconds: worker logs warning and continues config loading.
- Empty first message: agent does not call `session.say`.
- Empty extracted text: document error `KB_EMPTY_TEXT`.
- Too many redirects: document error `KB_TOO_MANY_REDIRECTS`.
- Unsupported URL/file content type: structured `KB_UNSUPPORTED_*` error.
- Large URL/file: `KB_DOWNLOAD_TOO_LARGE`.
- No RAG matches: no fabricated answer.
- Provider failure during RAG: unavailable message.
- Call-log server outage: payload queued locally.
- Queue repeated failure: file moves to `dead-letter`.
- Python process restart: in-memory KB job state is lost; status route cannot recover old jobs.
- Multi-tenant vector namespace risk: namespace is `agentId`, not `organizationId/agentId`; verify agent IDs are globally unique.

## Test Data, Fixtures, Accounts, And Roles

Unit-test fixture values from `apps/ai/tests`:

- Agent IDs: `agent_123`, `8d55565f-1111-4111-8111-f95fd03f0df2`
- Organization ID: `org_123`
- User ID: `user_123`
- Phone numbers: `+15551230000`, `+15550001111`, `+918877645613`, `+18005550100`
- Outbound ID: `2b1f6d53-42f5-4cc7-9689-7b6f51a0c113`
- KB IDs: `kb_123`, `kb_ok`, `kb_bad`, `kb_failed`, `kb_private`
- MCP connection: `conn_123`
- MCP read-only tool: `lookup_account`
- MCP side-effect tool: `send_email`

Suggested local manual fixtures:

- One owner account seeded with `task db:seed -- --email tester@example.com`.
- One organization with at least:
  - one configured agent,
  - one assigned phone number,
  - one active KB URL source,
  - one failed KB source,
  - one completed call log,
  - one zero-PII call log,
  - one connected read-only MCP tool if Smithery is available.
- One admin member and one member role for RBAC checks.

Supported KB files for upload testing:

- `.pdf`
- `.txt`
- `.csv`
- `.docx`
- `.xlsx`
- `.xls`

Use safe KB URL test data:

- Valid public HTML URL: `https://example.com/help`
- SSRF rejection URL: `http://127.0.0.1/admin`
- Metadata IP rejection URL: `http://169.254.169.254/latest/meta-data`
- Unsupported scheme: `file:///etc/passwd`

## External Services Or Blocked Checks

Mark these checks **Blocked** when credentials/services are unavailable.

1. **LiveKit worker and recording**

   Requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, SIP/telephony setup, and a reachable LiveKit project.

   Pass: worker joins room, processes audio, starts egress when allowed, and finalizes call.

   Fail: worker crashes, cannot parse metadata, or double-posts finalization.

2. **Twilio/Telnyx phone calls**

   Requires provider credentials and LiveKit SIP trunks.

   Pass: inbound/outbound call reaches LiveKit and produces correct call context.

   Fail: wrong direction/numbers/provider in call log.

3. **S3-compatible storage**

   Requires AWS/S3 credentials and bucket.

   Pass: recording file path is created under `Voice-agents/Recordings/`, and file is readable according to product policy.

   Fail: recording path saved but object missing when recording was expected.

4. **Google embeddings**

   Requires `GOOGLE_EMBEDDING_API_KEY` or `GOOGLE_API_KEY`.

   Pass: KB chunks and RAG queries embed successfully.

   Fail: provider error is hidden as an empty KB result.

5. **Pinecone**

   Requires `PINECONE_API_KEY` and `PINECONE_INDEX`.

   Pass: vectors are upserted/deleted in the target `agentId` namespace, and RAG retrieves only that namespace.

   Fail: stale vectors remain after KB replacement/delete.

6. **Smithery/MCP**

   Requires `SMITHERY_API_KEY` and a connected MCP server.

   Pass: attached read-only MCP tool executes and logs through server.

   Fail: side-effect tool executes from a voice call.

7. **Billing**

   Requires Stripe/test billing setup.

   Pass: upstream product/server gates enforce plan limits before AI incurs provider cost.

   Blocked: no Stripe test account/subscription.

   Fail: AI provider work continues beyond expected plan limits with no upstream gate.

8. **KB server/AI contract**

   Requires running server worker and AI service together.

   Pass: creating a KB source in the console eventually marks it `ACTIVE` or `ERROR` with a clear reason.

   Fail: server worker throws “KB processing returned an invalid response body” because AI returned an async job response.

9. **Langfuse Tracing**

   Requires `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_HOST`.

   Pass: traces appear in the Langfuse dashboard after call completes or smoke test finishes.

   Blocked: no Langfuse account/keys.

   Fail: worker crashes or hangs when Langfuse credentials are not provided or if the Langfuse host is unreachable.

## Regression Risks

- `POST /kb/process` async response currently does not match the server worker’s expected synchronous `processed` response.
- Server KB cleanup uses optional `KB_OPS_URL/delete`, while AI exposes `DELETE /kb/{agent_id}/{kb_id}`.
- KB jobs are stored in `_KB_JOBS` in memory; process restart loses job status.
- RAG namespace is only `agentId`; tenant safety depends on globally unique agent IDs and server-side config isolation.
- Call-log server schema requires UUID `agentId`; non-UUID test IDs must not leak into production data.
- Internal call-log auth requires org and user context; missing `user_id` can cause server rejection.
- `zero_pii_retention` must consistently disable recording, transcripts, and downstream persistence.
- MCP tool filtering must continue hiding side-effect tools as providers add new tool metadata shapes.
- Dependency ranges in `requirements.txt` are broad; provider SDK changes can break runtime behavior.
- Docker image skips model download only when `SKIP_MODEL_DOWNLOAD=true`; production builds may fail or slow down if model download changes.
- Langfuse SDK initialization and tracing could block session shutdown or finalization if flush fails or networks are slow. Trace calls must fail gracefully and not interrupt the live agent conversation.

## Release Acceptance Checklist

- [ ] `python -m pytest tests -q` passes in `apps/ai`.
- [ ] `scripts/ci-docker-build.sh` passes or Docker validation is explicitly blocked.
- [ ] `GET /health` returns 200 without auth.
- [ ] All non-health AI routes require valid internal auth.
- [ ] Runtime config loads from server by number and by agent ID, with normalized provider/model/privacy fields.
- [ ] LiveKit worker real-call test passes, or is blocked with missing credentials listed.
- [ ] Call finalization posts exactly one call log and queues on server outage.
- [ ] Zero-PII and `store_call_audio=false` behavior is verified.
- [ ] KB validation rejects unsafe URLs and oversized jobs.
- [ ] KB happy path with Google embeddings and Pinecone is verified, or blocked with credentials listed.
- [ ] Server/AI KB processing contract is compatible.
- [ ] KB delete removes Pinecone vectors or cleanup route mismatch is resolved.
- [ ] RAG retrieves only from the correct agent namespace and handles provider failure safely.
- [ ] MCP exposes only read-only attached tools and redacts/truncates output.
- [ ] Console KB, agent Advanced/Knowledge, and Calls pages show correct loading, empty, error, success, and destructive-action states.
- [ ] Owner/admin/member RBAC behavior is verified for AI-related server/console features.
- [ ] Logs and metrics contain no raw phone numbers, prompts, transcripts, webhooks, or secrets.
- [ ] Langfuse tracing compiles/imports correctly and records the `voice-agent-session` trace and nested generation/tool spans without disrupting the call workflow.
