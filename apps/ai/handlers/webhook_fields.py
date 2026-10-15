from typing import Any


def webhook_header_values(headers: Any) -> dict[str, str]:
    if not isinstance(headers, dict):
        return {}
    resolved: dict[str, str] = {}
    for key, entry in headers.items():
        if not key:
            continue
        value = entry.get("value") if isinstance(entry, dict) else entry
        if value not in (None, ""):
            resolved[str(key)] = str(value)
    return resolved


def webhook_body_values(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        return {}
    resolved: dict[str, Any] = {}
    for key, entry in body.items():
        if not key:
            continue
        value = entry.get("value") if isinstance(entry, dict) else entry
        if value not in (None, ""):
            resolved[str(key)] = value
    return resolved
