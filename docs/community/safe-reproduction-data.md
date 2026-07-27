# Safe Reproduction Data

Use synthetic data in public issues, tests, screenshots, and docs. Redaction is not the same as safety: changing a few characters in a real transcript, phone number, signed URL, or token can still expose private data.

## Synthetic formats

| Data type | Safe example | Notes |
| --- | --- | --- |
| Phone number | `+15550101000` | Use reserved `555-0100` style numbers for examples; never use customer numbers. |
| Email | `caller@example.localhost` | `.localhost` and `example.*` domains are documentation-safe. |
| Call ID | `call_test_20260726_0001` | Do not copy provider call SIDs from production. |
| Agent ID | `agent_demo_receptionist` | Avoid real organization or customer names. |
| Transcript | `Caller: I need a demo appointment. Agent: I can help with that.` | Rewrite from scratch; do not lightly edit real transcripts. |
| Webhook URL | `https://webhook.example.invalid/quickvoice/test` | Do not share signed URLs or webhook.site URLs containing private payloads. |
| Provider ID | `twilio_test_trunk_001`, `telnyx_test_connection_001` | Keep IDs obvious and synthetic. |
| API key/token | `qv_test_REDACTED_EXAMPLE_ONLY` | If a real secret was exposed, rotate it; do not only redact the report. |
| S3 URL | `s3://quickvoice-example-bucket/test-object.wav` | Never post signed recording URLs. |

## Bug report checklist

- Replace real phone numbers, emails, organization names, and provider IDs.
- Rewrite transcripts and message bodies as synthetic examples.
- Remove cookies, authorization headers, API keys, signed URLs, and request IDs tied to customer data.
- Share the smallest command, route, or click path that reproduces the problem.
- For suspected credential exposure, rotate the secret first and follow [SECURITY.md](../../SECURITY.md).
- For normal support, follow [SUPPORT.md](../../SUPPORT.md).

## Fixtures already using safe placeholders

- Development env templates use local or placeholder values in `.env.dev.example`, `apps/server/.env.dev.example`, and `apps/ai/.env.dev.example`.
- Root tooling tests in `tests/dev-orchestration.test.mjs` assert that live-secret-shaped examples are not introduced into env templates.

Do not publish real recordings, customer transcripts, or provider payloads as fixtures.
