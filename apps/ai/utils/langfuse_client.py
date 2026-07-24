import os
from typing import Any
from utils.logger import logger


_LOGGED_LANGFUSE_STATUS = False


def _clean_env_value(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        cleaned = cleaned[1:-1].strip()
    return cleaned


def get_langfuse_keys() -> tuple[str | None, str | None, str]:
    pub_key_raw = os.environ.get("LANGFUSE_PUBLIC_KEY")
    sec_key_raw = os.environ.get("LANGFUSE_SECRET_KEY")
    host_raw = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")

    public_key = _clean_env_value(pub_key_raw) if pub_key_raw else None
    secret_key = _clean_env_value(sec_key_raw) if sec_key_raw else None
    host = _clean_env_value(host_raw) if host_raw else "https://cloud.langfuse.com"

    # Filter dummy/placeholder keys
    if public_key and public_key.startswith("pk-lf-xxxx"):
        public_key = None
    if secret_key and secret_key.startswith("sk-lf-xxxx"):
        secret_key = None

    return public_key, secret_key, host


def get_langfuse_client() -> Any | None:
    global _LOGGED_LANGFUSE_STATUS
    public_key, secret_key, host = get_langfuse_keys()

    if not public_key or not secret_key:
        if not _LOGGED_LANGFUSE_STATUS:
            _LOGGED_LANGFUSE_STATUS = True
            logger.info("[langfuse] tracing disabled: missing or placeholder credentials")
        return None

    try:
        from langfuse import Langfuse

        client = Langfuse(
            public_key=public_key,
            secret_key=secret_key,
            host=host,
        )
        if not _LOGGED_LANGFUSE_STATUS:
            _LOGGED_LANGFUSE_STATUS = True
            logger.info("[langfuse] client initialized with host={}", host)
        return client
    except Exception as exc:
        if not _LOGGED_LANGFUSE_STATUS:
            _LOGGED_LANGFUSE_STATUS = True
            logger.warning("[langfuse] failed to initialize client: {}", str(exc))
        return None
