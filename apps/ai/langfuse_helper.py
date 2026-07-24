import os
from typing import Optional

from langfuse import Langfuse


def get_langfuse_client() -> Optional[Langfuse]:
    """Create and return a Langfuse client using environment variables.

    Expected env vars: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL (or LANGFUSE_URL).

    Returns ``None`` if credentials are not set, so callers can degrade
    gracefully without a try/except.
    """
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    base_url = (
        os.getenv("LANGFUSE_BASE_URL")
        or os.getenv("LANGFUSE_URL")
        or "https://cloud.langfuse.com"
    )
    if not public_key or not secret_key:
        return None
    return Langfuse(
        public_key=public_key,
        secret_key=secret_key,
        host=base_url,
    )
