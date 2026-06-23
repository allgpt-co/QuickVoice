#!/usr/bin/env bash
set -euo pipefail

docker buildx build \
  --file apps/server/Dockerfile \
  --target build \
  --tag quickvoice-server:ci \
  --load \
  .

docker buildx build \
  --file apps/ai/Dockerfile \
  --build-arg PREINSTALL_CPU_TORCH=true \
  --build-arg SKIP_MODEL_DOWNLOAD=true \
  --tag quickvoice-ai:ci \
  --load \
  apps/ai
