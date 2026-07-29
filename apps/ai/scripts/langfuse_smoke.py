"""
Langfuse connectivity smoke test for the QuickVoice AI voice agent.

Sends exactly one trace to Langfuse using the same env vars the agent reads, so
you can confirm credentials / host / network work WITHOUT spinning up LiveKit or
placing a call. Run it after filling in apps/ai/.env.dev (or .env):

    cd apps/ai && .venv/Scripts/python scripts/langfuse_smoke.py   # Windows
    cd apps/ai && .venv/bin/python scripts/langfuse_smoke.py       # macOS/Linux

Exits non-zero if authentication fails.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

APP_DIR = Path(__file__).resolve().parents[1]


def _load_env() -> None:
    # Load .env.dev first, then .env. load_dotenv does not override values that
    # are already set, so whichever is loaded first wins -- matching how the
    # agent layers its dev config on top of the base file.
    for name in (".env.dev", ".env"):
        path = APP_DIR / name
        if path.exists():
            load_dotenv(path)
            print(f"[smoke] loaded {path}")


def main() -> int:
    _load_env()

    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "").strip()
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "").strip()
    host = (
        os.getenv("LANGFUSE_HOST")
        or os.getenv("LANGFUSE_BASE_URL")
        or "https://cloud.langfuse.com"
    ).strip().rstrip("/")

    if not public_key or not secret_key:
        print(
            "[smoke] LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are not set. "
            "Fill them into apps/ai/.env.dev or apps/ai/.env and re-run.",
            file=sys.stderr,
        )
        return 1

    print(f"[smoke] using Langfuse host -> {host}")

    from langfuse import Langfuse

    client = Langfuse(
        public_key=public_key,
        secret_key=secret_key,
        base_url=host,
    )

    # auth_check() returns True on success, but on bad credentials / wrong host
    # the SDK raises (e.g. UnauthorizedError) instead of returning False -- treat
    # both as a failure and exit non-zero with a readable message.
    try:
        authed = client.auth_check()
    except Exception as error:  # noqa: BLE001
        print(
            f"[smoke] auth_check() failed: {error}\n"
            "        check LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_HOST and network.",
            file=sys.stderr,
        )
        return 2

    if not authed:
        print(
            "[smoke] auth_check() returned False: check your keys and host / network.",
            file=sys.stderr,
        )
        return 2

    print("[smoke] auth_check() OK")

    with client.start_as_current_span(name="quickvoice-langfuse-smoke") as span:
        span.update(
            input={"probe": "hello from quickvoice"},
            output={"status": "ok"},
            metadata={"source": "scripts/langfuse_smoke.py", "component": "connectivity-test"},
        )

    client.flush()

    print(
        "[smoke] sent one trace 'quickvoice-langfuse-smoke'. "
        f"Look for it in your Langfuse project at {host} -> Tracing."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
