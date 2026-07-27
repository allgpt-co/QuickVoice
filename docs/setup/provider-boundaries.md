# Provider Boundaries And Local Substitutes

A successful local startup proves the QuickVoice services can run together; it does not prove that external provider-backed behavior is configured. Use this matrix to separate local inspection from features that require your own accounts.

| Feature area | Env/config evidence | Code path evidence | Local substitute | Boundary |
| --- | --- | --- | --- | --- |
| LiveKit voice sessions | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `apps/server/.env.dev.example` and `apps/ai/.env.dev.example` | `apps/ai/handlers/livekit_handler.py`, `apps/server/src/common/utils/setLiveKitBinding.ts` | None for real media rooms | Startup can be inspected locally; real calls need LiveKit credentials and reachable rooms. |
| Twilio telephony | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_TRUNK_SID`, `LIVEKIT_SIP_OUTBOUND_TRUNK_TWILIO_ID` in `apps/server/.env.dev.example` | `apps/server/src/modules/phone-number`, `apps/server/src/modules/outbound` | None | Number purchase, inbound routing, and outbound calls require a configured Twilio account. |
| Telnyx telephony | `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID`, `LIVEKIT_SIP_OUTBOUND_TRUNK_TELNYX_ID` in `apps/server/.env.dev.example` | `apps/server/src/modules/phone-number`, `apps/server/src/modules/outbound` | None | Telnyx-backed calling requires customer-owned Telnyx credentials and SIP setup. |
| Speech and model providers | `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `SARVAM_API_KEY`, `BEDROCK_MODEL_ID`, AWS keys in `apps/ai/.env.dev.example` | `apps/ai/handlers/worker_handler.py`, `apps/ai/voice` | Catalog inspection only | Real STT, LLM, and TTS responses require provider credentials and quotas. |
| Pinecone knowledge retrieval | `PINECONE_API_KEY`, `PINECONE_HOST`, `PINECONE_EMBEDDING_MODEL` in `apps/ai/.env.dev.example` | `apps/ai/handlers/kb_handler.py`, `apps/server/src/modules/knowledge-base` | Local metadata/database inspection | Vector search requires a reachable Pinecone index. |
| S3-compatible storage | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME` in `apps/server/.env.dev.example` and `apps/ai/.env.dev.example` | `apps/server/src/modules/calllogs`, `apps/ai/handlers/calllog_handler.py` | None by default | Recording and object storage paths require compatible storage credentials. |
| Stripe billing | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in `apps/server/.env.dev.example` | `apps/server/src/modules/billing` | None | Billing UI can render locally; real checkout/webhook behavior requires Stripe test or live keys. |
| OAuth sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_URL` in `apps/server/.env.dev.example` | `apps/server/src/lib/auth.ts` | Email/password or seeded local users where configured | OAuth redirects require a configured OAuth app and callback URL. |
| Email delivery | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `FROM_EMAIL` in `apps/server/.env.dev.example` | `apps/server/src/modules` mail/send flows | [Mailpit](./mailpit-smoke.md) for local SMTP | Mailpit proves local SMTP only; production delivery requires provider DNS/account setup. |
| MCP and Smithery tools | `SMITHERY_NAMESPACE`, `SMITHERY_API_KEY` in `apps/server/.env.dev.example` | `apps/server/src/modules/mcp`, `apps/ai/handlers/mcp_handler.py` | Local custom HTTP tools where configured | Third-party tool execution requires the configured provider and approved tool permissions. |

## Reporting rule

When a feature needs a provider, report whether the failure happens before or after you supplied your own credentials. Share variable names and code paths only; never share credential values.

Related guides: [safe reproduction data](../community/safe-reproduction-data.md), [Mailpit smoke testing](./mailpit-smoke.md), and [Docker health](./docker-health.md).
