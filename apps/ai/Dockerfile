# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e

# Keep the release and digest together: the tag documents the Python version,
# while the digest makes rebuilds use the exact reviewed base image.
ARG PYTHON_IMAGE=python:3.12.14-slim-bookworm@sha256:392307d22300de8b5986851a12d9176dfc0fc073e65bf6523ebd7dcbeb23564e

FROM ${PYTHON_IMAGE} AS dependencies

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    linux-libc-dev \
    python3-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.lock ./

RUN python -m venv /opt/venv \
  && /opt/venv/bin/pip install \
    --require-hashes \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    -r requirements.lock

FROM ${PYTHON_IMAGE} AS runtime

ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    AI_API_PORT=5555 \
    AI_BILLING_USAGE_QUEUE_DIR=/var/lib/quickvoice/billing-usage \
    AI_CALL_LOG_QUEUE_DIR=/var/lib/quickvoice/call-logs

# Torch/ONNX wheels need libgomp at runtime; compilers remain in the dependency stage.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libgomp1 \
  && rm -rf /var/lib/apt/lists/*

ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

WORKDIR /app
COPY --from=dependencies /opt/venv /opt/venv
COPY . .

RUN mkdir -p "${AI_BILLING_USAGE_QUEUE_DIR}" "${AI_CALL_LOG_QUEUE_DIR}" \
  && chown -R appuser:appuser /app /var/lib/quickvoice

USER appuser

# Download models at build time so calls do not depend on runtime downloads.
ARG SKIP_MODEL_DOWNLOAD=false
RUN if [ "$SKIP_MODEL_DOWNLOAD" = "true" ]; then \
      echo "Skipping model download for CI Docker build validation"; \
    else \
      python "main.py" download-files; \
    fi

EXPOSE 5555
CMD ["python", "main.py", "serve"]
