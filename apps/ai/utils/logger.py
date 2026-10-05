import copy
import logging
import os
import re
import sys


# Bounded candidates cannot swallow newlines, adjacent IDs, or part of a decimal.
PHONE_RE = re.compile(r"(?<![\w.+-])(?:\+|\()?[0-9](?:[ ().-]{0,3}[0-9]){6,14}(?![\w-]|\.[0-9])")
NON_PHONE_NUMBER_RE = re.compile(r"[+-]?[0-9]+\.[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2}")
IDENTIFIER_KEY_RE = re.compile(r"(?:^|_)(?:id|sku|mrn|isbn)(?:_|$)", re.I)
IDENTIFIER_LABEL_RE = re.compile(r"\b(?:sku|mrn|isbn(?:-1[03])?|order[ _-]?id)\s*[:=#-]?\s*$", re.I)
PHONE_KEY_RE = re.compile(r"(?:^|_)(?:phone|telephone|mobile|fax|from_number|to_number)(?:_|$)", re.I)
SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
SENSITIVE_KEY_PARTS = (
    "authorization",
    "api_key",
    "apikey",
    "secret",
    "token",
    "password",
    "system_prompt",
    "prompt",
    "transcript",
    "message",
    "content",
    "variables",
    "webhook",
)


def redact_sensitive(value):
    return _redact(copy.deepcopy(value), parent_key="")


def _redact(value, *, parent_key: str):
    if _is_sensitive_key(parent_key):
        return "[REDACTED]"

    if isinstance(value, dict):
        return {key: _redact(item, parent_key=str(key)) for key, item in value.items()}

    if isinstance(value, list):
        return [_redact(item, parent_key=parent_key) for item in value]

    key = re.sub(r"([a-z])([A-Z])", r"\1_\2", parent_key).lower().replace("-", "_")
    if PHONE_KEY_RE.search(key) and isinstance(value, (str, int, float)) and not isinstance(value, bool):
        return "[REDACTED_PHONE]" if str(value).strip() else value

    if isinstance(value, str):
        value = SSN_RE.sub("[REDACTED_SSN]", value)
        if IDENTIFIER_KEY_RE.search(key):
            return value

        def mask_phone(match):
            candidate = match.group()
            if NON_PHONE_NUMBER_RE.fullmatch(candidate):
                return candidate
            if IDENTIFIER_LABEL_RE.search(value[max(0, match.start() - 40):match.start()]):
                return candidate
            # ponytail: unlabelled digit strings are ambiguous; mask 10–15 digits
            # conservatively. Richer field schemas are needed to disambiguate IDs.
            digits = sum(char.isdigit() for char in candidate)
            if digits >= 10 or (digits >= 7 and candidate.startswith("+")):
                return "[REDACTED_PHONE]"
            return candidate

        return PHONE_RE.sub(mask_phone, value)

    return value


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    return any(part in normalized for part in SENSITIVE_KEY_PARTS)


class _StdlibLogger:
    def __init__(self):
        self._logger = logging.getLogger("quickvoice.ai")
        if not self._logger.handlers:
            handler = logging.StreamHandler(sys.stderr)
            handler.setFormatter(
                logging.Formatter(
                    "%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d - %(message)s"
                )
            )
            self._logger.addHandler(handler)
        self._logger.setLevel(logging.INFO)

    def debug(self, message, *args, **kwargs):
        self._log(logging.DEBUG, message, *args, **kwargs)

    def info(self, message, *args, **kwargs):
        self._log(logging.INFO, message, *args, **kwargs)

    def warning(self, message, *args, **kwargs):
        self._log(logging.WARNING, message, *args, **kwargs)

    def error(self, message, *args, **kwargs):
        self._log(logging.ERROR, message, *args, **kwargs)

    def exception(self, message, *args, **kwargs):
        self._log(logging.ERROR, message, *args, exc_info=True, **kwargs)

    def _log(self, level, message, *args, **kwargs):
        if args:
            try:
                message = str(message).format(*args)
            except Exception:
                message = f"{message} {args}"
        self._logger.log(level, message, **kwargs)


def _build_logger():
    try:
        from loguru import logger as loguru_logger  # type: ignore
    except Exception:
        return _StdlibLogger()

    loguru_logger.remove()
    log_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
        "<level>{message}</level>"
    )
    diagnose = os.getenv("AI_LOG_DIAGNOSE", "").lower() in {"1", "true", "yes", "on"}
    loguru_logger.add(
        sys.stderr,
        level=os.getenv("AI_LOG_LEVEL", "INFO"),
        format=log_format,
        colorize=True,
        backtrace=False,
        diagnose=diagnose,
    )
    return loguru_logger


logger = _build_logger()
