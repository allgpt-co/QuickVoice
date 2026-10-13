from datetime import date
from math import isfinite
from typing import Any


def build_metadata_collection_instructions(config: dict[str, Any]) -> str:
    data_needed = _objects(config.get("data_needed"))
    data_evaluation = _objects(config.get("data_evaluation"))
    sections: list[str] = []

    if data_needed:
        lines = [
            "Collect the configured call data during the conversation. When the caller provides one of these values, call record_call_extracted_data with the field id or name and the value. Use YYYY-MM-DD for dates and a listed option for choice fields:",
        ]
        lines.extend(f"- {_target_label(item)}" for item in data_needed)
        sections.append("\n".join(lines))

    if data_evaluation:
        lines = [
            "Evaluate the configured call criteria when there is enough evidence. Call record_call_evaluation with the criterion id or name and the result:",
        ]
        lines.extend(f"- {_evaluation_label(item)}" for item in data_evaluation)
        sections.append("\n".join(lines))

    return "\n\n".join(sections)


class CallMetadataCollector:
    def __init__(self, config: dict[str, Any]):
        self._config = config
        self._data_needed = _objects(config.get("data_needed"))
        self._data_evaluation = _objects(config.get("data_evaluation"))
        _ensure_list(config, "data_extracted")
        _ensure_list(config, "data_evaluated")

    def record_extracted_data(self, field: str, value: Any) -> str:
        field_key = str(field or "").strip()
        if not field_key:
            return "No data field was provided."

        target = _match_target(self._data_needed, field_key)
        if target is None:
            return f"Unknown data field {field_key}. Use a configured field id or name."
        try:
            normalized_value = _normalize_field_value(target, value)
        except ValueError as exc:
            return f"Could not record {field_key}: {exc}"
        item = {
            "type": str(target.get("type") or "text"),
            "name": str(target.get("name") or field_key),
            "description": str(target.get("description") or ""),
            "value": normalized_value,
        }
        _upsert(self._config["data_extracted"], item, key="name")
        return f"Recorded {item['name']}."

    def record_evaluation(self, identifier: str, value: Any) -> str:
        identifier_key = str(identifier or "").strip()
        if not identifier_key:
            return "No evaluation identifier was provided."

        target = _match_target(self._data_evaluation, identifier_key)
        if target is None:
            return f"Unknown evaluation {identifier_key}. Use a configured criterion id or name."
        item = {
            "identifier": str(target.get("id") or target.get("name") or identifier_key),
            "description": str(target.get("criteria") or target.get("description") or ""),
            "value": _normalize_value(value),
        }
        _upsert(self._config["data_evaluated"], item, key="identifier")
        return f"Recorded evaluation {item['identifier']}."


def _objects(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _ensure_list(config: dict[str, Any], key: str) -> None:
    if not isinstance(config.get(key), list):
        config[key] = []


def _match_target(targets: list[dict[str, Any]], key: str) -> dict[str, Any] | None:
    normalized = key.strip().lower()
    for target in targets:
        candidates = (target.get("id"), target.get("name"), target.get("identifier"))
        if any(str(candidate).strip().lower() == normalized for candidate in candidates if candidate):
            return target
    return None


def _upsert(items: list[dict[str, Any]], item: dict[str, Any], *, key: str) -> None:
    target_key = str(item.get(key) or "").strip().lower()
    for index, existing in enumerate(items):
        if str(existing.get(key) or "").strip().lower() == target_key:
            items[index] = item
            return
    items.append(item)


def _normalize_value(value: Any) -> Any:
    if isinstance(value, str):
        normalized = value.strip()
        lowered = normalized.lower()
        if lowered in {"true", "yes"}:
            return True
        if lowered in {"false", "no"}:
            return False
        if lowered in {"", "null", "none", "n/a", "unknown"}:
            return None
        return normalized
    return value


def _normalize_field_value(target: dict[str, Any], value: Any) -> Any:
    field_type = str(target.get("type") or "string").lower()
    if field_type in {"string", "text"}:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("provide a non-empty text value")
        return value.strip()
    if field_type == "number":
        if isinstance(value, bool):
            raise ValueError("provide a number")
        try:
            number = float(value)
        except (TypeError, ValueError):
            raise ValueError("provide a number") from None
        if not isfinite(number):
            raise ValueError("provide a finite number")
        return int(number) if number.is_integer() else number
    if field_type == "boolean":
        normalized = _normalize_value(value)
        if not isinstance(normalized, bool):
            raise ValueError("provide true or false")
        return normalized
    if field_type == "date":
        try:
            return date.fromisoformat(str(value).strip()).isoformat()
        except ValueError:
            raise ValueError("provide a date in YYYY-MM-DD format") from None
    if field_type == "choice":
        options = target.get("options") or []
        if not isinstance(value, str) or not value.strip() or not isinstance(options, list):
            raise ValueError("choose a configured option")
        if not options:
            # Legacy choice definitions had no options and accepted free text.
            return value.strip()
        match = next((option for option in options if isinstance(option, str) and option.casefold() == value.strip().casefold()), None)
        if match is None:
            raise ValueError("choose a configured option")
        return match
    raise ValueError("unsupported field type")


def _target_label(item: dict[str, Any]) -> str:
    field_id = item.get("id") or item.get("name")
    field_type = item.get("type") or "text"
    name = item.get("name") or field_id
    description = item.get("description") or ""
    options = item.get("options") if field_type == "choice" else None
    choices = f"; choose one of: {', '.join(options)}" if isinstance(options, list) else ""
    return f"{field_id} ({field_type}) - {name}: {description}{choices}"


def _evaluation_label(item: dict[str, Any]) -> str:
    identifier = item.get("id") or item.get("name")
    name = item.get("name") or identifier
    criteria = item.get("criteria") or item.get("description") or ""
    return f"{identifier} - {name}: {criteria}"
