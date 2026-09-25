# syntax=docker/dockerfile:1.7

ARG PYTHON_IMAGE=python:3.12.14-slim-bookworm@sha256:392307d22300de8b5986851a12d9176dfc0fc073e65bf6523ebd7dcbeb23564e
ARG TEI_IMAGE=ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4@sha256:2538ea1c9640d3763b15af668039d24172d063b42337b0c27796fc2be180c78d

FROM ${PYTHON_IMAGE} AS model-builder
WORKDIR /build
COPY fetch_model.py ./fetch_model.py
RUN python ./fetch_model.py --output /model

FROM ${TEI_IMAGE}
LABEL org.opencontainers.image.title="QuickVoice all-MiniLM-L12-v2 embeddings" \
      org.opencontainers.image.source="https://github.com/allgpt-co/QuickVoice" \
      org.opencontainers.image.licenses="Apache-2.0" \
      ai.quickvoice.model.id="sentence-transformers/all-MiniLM-L12-v2" \
      ai.quickvoice.model.revision="a50ef00143b4d5391434df20ae11632588ac25be" \
      ai.quickvoice.model.max-input-tokens="256"

COPY --from=model-builder --chown=1000:1000 /model /models/all-MiniLM-L12-v2

ENV HOME=/tmp \
    HUGGINGFACE_HUB_CACHE=/tmp/huggingface \
    PORT=80

USER 1000:1000
EXPOSE 80

CMD ["--model-id", "/models/all-MiniLM-L12-v2", \
     "--dtype", "float32", \
     "--served-model-name", "all-MiniLM-L12-v2", \
     "--max-client-batch-size", "32", \
     "--max-batch-tokens", "4096", \
     "--auto-truncate=false", \
     "--json-output"]
