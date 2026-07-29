#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
QuickVoice Langfuse integration demo
===================================

1. Add the following to apps/ai/.env.dev:
   LANGFUSE_PUBLIC_KEY=your-public-key
   LANGFUSE_SECRET_KEY=your-secret-key
   LANGFUSE_HOST=https://cloud.langfuse.com

2. Start the AI API and worker:
   task ai:api
   task ai:worker

3. Trigger a voice session and observe traces in Langfuse:
   curl -X POST http://localhost:5555/voice/sessions \
     -H 'content-type: application/json' \
     -H "x-internal-key: ${INTERNAL_API_KEY:-dev-internal-key-change-me}" \
     -d '{"participant":{"identity":"local-test","name":"Local Test"}}'

4. The worker will emit session lifecycle events and evaluation traces automatically.
EOF
