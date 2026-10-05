import re
from pathlib import Path


AI_ROOT = Path(__file__).resolve().parents[1]


def test_production_image_is_reproducible_and_keeps_queues_out_of_tmp():
    dockerfile = (AI_ROOT / "Dockerfile").read_text(encoding="utf-8")
    lockfile = (AI_ROOT / "requirements.lock").read_text(encoding="utf-8")

    assert re.fullmatch(
        r"# syntax=docker/dockerfile:1@sha256:[0-9a-f]{64}",
        dockerfile.splitlines()[0],
    )
    assert re.search(
        r"^ARG PYTHON_IMAGE=python:3\.12\.14-slim-bookworm@sha256:[0-9a-f]{64}$",
        dockerfile,
        re.MULTILINE,
    )
    assert "--require-hashes" in dockerfile
    assert re.search(r"^[a-zA-Z0-9_.-]+==\S+", lockfile, re.MULTILINE)
    assert "--hash=sha256:" in lockfile
    assert "ghcr.io/astral-sh/uv:0.9.18-python3.12-bookworm-slim@sha256:" in lockfile

    runtime = dockerfile.split(" AS runtime", maxsplit=1)[1]
    assert "gcc" not in runtime
    assert "g++" not in runtime
    assert "python3-dev" not in runtime
    assert "AI_BILLING_USAGE_QUEUE_DIR=/var/lib/quickvoice/billing-usage" in runtime
    assert "AI_CALL_LOG_QUEUE_DIR=/var/lib/quickvoice/call-logs" in runtime
