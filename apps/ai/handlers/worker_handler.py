import asyncio
import json
import re
from collections.abc import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from typing import Any
from utils.logger import logger

PREVIEW_TRANSCRIPT_TOPIC = "quickvoice.preview.transcript"
PREVIEW_TRANSCRIPT_TYPE = "preview_user_transcript"
DYNAMIC_VARIABLE_TOKEN_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")

ROUTING_METADATA_KEYS = {
    "agent_id",
    "agentId",
    "agent_number",
    "agentNumber",
    "agent_language",
    "agentLanguage",
    "call_id",
    "callId",
    "callDirection",
    "direction",
    "dynamic_variables",
    "dynamicVariables",
    "first_message",
    "firstMessage",
    "from_number",
    "fromNumber",
    "language",
    "outbound_id",
    "outboundId",
    "phoneNumber",
    "provider",
    "sip.callID",
    "sip.phoneNumber",
    "sip.trunkPhoneNumber",
    "sip_call_id",
    "sip_phone_number",
    "sip_trunk_phone_number",
    "system_prompt",
    "systemPrompt",
    "to_number",
    "toNumber",
    "trunkPhoneNumber",
    "user_number",
    "userNumber",
    "voice_id",
    "voiceId",
}

def parse_metadata(metadata: str | None) -> dict[str, Any]:
    if not metadata:
        return {}
    try:
        parsed = json.loads(metadata)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def build_call_context(room_name: str, metadata: dict[str, Any]) -> dict[str, Any]:
    source = _pick(metadata, "source")
    is_web_widget = source == "web_widget" or room_name.startswith("widget_")
    room_agent_number, room_user_number = (
        (None, None) if is_web_widget else _numbers_from_room(room_name)
    )
    direction = _pick(metadata, "direction", "callDirection") or "inbound"

    room_outbound_id = _outbound_id_from_room(room_name)
    outbound_id = _pick(metadata, "outbound_id", "outboundId") or room_outbound_id

    if direction == "outbound":
        agent_number = (
            _pick(metadata, "agent_number", "agentNumber", "from_number", "fromNumber")
            or room_agent_number
        )
        user_number = (
            _pick(metadata, "user_number", "userNumber", "to_number", "toNumber")
            or room_user_number
        )
        from_number = agent_number
        to_number = user_number
        call_id = (
            _pick(metadata, "call_id", "callId")
            or outbound_id
            or _pick(metadata, "sip.callID", "sip_call_id")
            or room_name
        )
    else:
        agent_number = _pick(
            metadata,
            "agent_number",
            "agentNumber",
            "to_number",
            "toNumber",
            "sip.trunkPhoneNumber",
            "sip_trunk_phone_number",
            "trunkPhoneNumber",
        ) or room_agent_number
        user_number = _pick(
            metadata,
            "user_number",
            "userNumber",
            "from_number",
            "fromNumber",
            "sip.phoneNumber",
            "sip_phone_number",
            "phoneNumber",
        ) or room_user_number
        from_number = user_number
        to_number = agent_number
        call_id = (
            _pick(metadata, "call_id", "callId", "sip.callID", "sip_call_id")
            or room_name
        )

    return {
        "call_id": call_id,
        "agent_id": _pick(metadata, "agent_id", "agentId"),
        "agent_number": agent_number,
        "user_number": user_number,
        "direction": direction,
        "from_number": from_number,
        "to_number": to_number,
        "outbound_id": (
            outbound_id
            if direction == "outbound"
            else _pick(metadata, "outbound_id", "outboundId")
        ),
        "provider": _pick(metadata, "provider"),
        "metadata": _metadata_extras(metadata),
    }


def apply_metadata_overrides(config: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    updated = dict(config)
    mode = _pick(metadata, "mode")
    direction = _pick(metadata, "direction", "callDirection")
    first_message = _pick(metadata, "first_message", "firstMessage")
    system_prompt = _pick(metadata, "system_prompt", "systemPrompt")
    language = _pick(metadata, "language", "agent_language", "agentLanguage")
    voice_id = _pick(metadata, "voice_id", "voiceId")
    metadata_dynamic_variables = _pick(metadata, "dynamic_variables", "dynamicVariables")
    should_apply_metadata_overrides = direction == "outbound" or mode in {"preview", "widget"}
    if should_apply_metadata_overrides:
        if first_message:
            updated["first_message"] = first_message
        if system_prompt:
            updated["system_prompt"] = system_prompt
        if language:
            updated["agent_language"] = language
        if voice_id:
            updated["voice"] = voice_id
    dynamic_variables = merge_dynamic_variables(
        dynamic_variable_placeholders(updated.get("variables")),
        metadata_dynamic_variables,
    )
    if dynamic_variables:
        updated["dynamic_variables"] = dynamic_variables
        updated["first_message"] = render_dynamic_variables(
            str(updated.get("first_message") or ""),
            dynamic_variables,
        )
        updated["system_prompt"] = render_dynamic_variables(
            str(updated.get("system_prompt") or ""),
            dynamic_variables,
        )
    return updated


async def apply_initiation_webhook_metadata(
    config: dict[str, Any],
    metadata: dict[str, Any],
    call_context: dict[str, Any],
    *,
    fetch_json: Callable[[dict[str, Any], dict[str, Any], dict[str, Any]], Any] | None = None,
) -> dict[str, Any]:
    webhook = config.get("initiation_webhook")
    if not isinstance(webhook, dict) or not webhook.get("webhook_url"):
        return metadata
    if _pick(metadata, "mode") == "preview":
        return metadata

    try:
        response = await (fetch_json or fetch_initiation_webhook_json)(
            webhook,
            metadata,
            call_context,
        )
    except Exception as error:
        logger.warning("[webhook:initiation] request failed: {}", str(error))
        response = {}

    webhook_mappings = webhook.get("dynamic_variables")
    mapped_dynamic_variables = resolve_webhook_dynamic_variables(
        response,
        webhook_mappings,
    )
    webhook_dynamic_variables = (
        mapped_dynamic_variables
        if isinstance(webhook_mappings, dict)
        else extract_webhook_dynamic_variables(response)
    )
    existing_dynamic_variables = _pick(metadata, "dynamic_variables", "dynamicVariables")
    dynamic_variables = merge_dynamic_variables(
        webhook_dynamic_variables,
        existing_dynamic_variables,
    )

    if not dynamic_variables:
        return metadata

    updated = dict(metadata)
    updated["dynamic_variables"] = dynamic_variables
    return updated


async def fetch_initiation_webhook_json(
    webhook: dict[str, Any],
    metadata: dict[str, Any],
    call_context: dict[str, Any],
) -> Any:
    return await asyncio.to_thread(_fetch_initiation_webhook_json, webhook, metadata, call_context)


def _fetch_initiation_webhook_json(
    webhook: dict[str, Any],
    metadata: dict[str, Any],
    call_context: dict[str, Any],
) -> Any:
    method = str(webhook.get("method") or "POST").upper()
    headers = {"Accept": "application/json"}
    headers.update(webhook_header_values(webhook.get("headers")))

    body = None
    if method == "POST":
        headers.setdefault("Content-Type", "application/json")
        request_body = webhook_body_values(webhook.get("body"))
        request_body.setdefault("call", call_context)
        request_body.setdefault("metadata", metadata)
        body = json.dumps(request_body).encode("utf-8")

    request = Request(
        str(webhook["webhook_url"]),
        data=body,
        headers=headers,
        method=method,
    )

    try:
        with urlopen(request, timeout=4) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as error:
        raise RuntimeError(f"HTTP {error.code}") from error
    except URLError as error:
        raise RuntimeError(str(error.reason)) from error

    if not raw.strip():
        return {}
    return json.loads(raw)


def webhook_header_values(headers: Any) -> dict[str, str]:
    if not isinstance(headers, dict):
        return {}

    resolved: dict[str, str] = {}
    for key, entry in headers.items():
        if not key:
            continue
        if isinstance(entry, dict):
            value = entry.get("value")
        else:
            value = entry
        if value in (None, ""):
            continue
        resolved[str(key)] = str(value)
    return resolved


def webhook_body_values(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        return {}

    resolved: dict[str, Any] = {}
    for key, entry in body.items():
        if not key:
            continue
        if isinstance(entry, dict):
            value = entry.get("value")
        else:
            value = entry
        if value in (None, ""):
            continue
        resolved[str(key)] = value
    return resolved


def extract_webhook_dynamic_variables(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}

    for key in ("dynamic_variables", "dynamicVariables", "variables"):
        variables = payload.get(key)
        if isinstance(variables, dict):
            return normalize_dynamic_variables(variables)
    return normalize_dynamic_variables(payload)


def resolve_webhook_dynamic_variables(
    payload: Any,
    mappings: Any,
) -> dict[str, Any]:
    if not isinstance(mappings, dict):
        return {}

    resolved: dict[str, Any] = {}
    for name, path in mappings.items():
        variable_name = str(name).strip()
        if not variable_name or not isinstance(path, str) or not path.strip():
            continue

        value = value_at_json_path(payload, path)
        if value in (None, ""):
            continue
        resolved[variable_name] = value
    return resolved


def value_at_json_path(payload: Any, path: str) -> Any:
    if payload is None:
        return None

    normalized_path = path.strip()
    if not normalized_path:
        return None
    if normalized_path.startswith("$."):
        normalized_path = normalized_path[2:]
    elif normalized_path == "$":
        return payload

    if isinstance(payload, dict) and normalized_path in payload:
        return payload[normalized_path]

    tokens = json_path_tokens(normalized_path)
    if not tokens:
        return None

    current = payload
    for token in tokens:
        if isinstance(token, int):
            if not isinstance(current, list) or token < 0 or token >= len(current):
                return None
            current = current[token]
            continue

        if not isinstance(current, dict) or token not in current:
            return None
        current = current[token]
    return current


def json_path_tokens(path: str) -> list[str | int]:
    tokens: list[str | int] = []
    for part in path.split("."):
        if not part:
            return []

        cursor = 0
        name_chars: list[str] = []
        while cursor < len(part):
            char = part[cursor]
            if char == "[":
                if name_chars:
                    tokens.append("".join(name_chars))
                    name_chars = []
                end = part.find("]", cursor + 1)
                if end == -1:
                    return []
                index_text = part[cursor + 1 : end]
                if not index_text.isdigit():
                    return []
                tokens.append(int(index_text))
                cursor = end + 1
                continue
            name_chars.append(char)
            cursor += 1

        if name_chars:
            tokens.append("".join(name_chars))
    return tokens


def dynamic_variable_placeholders(variables: Any) -> dict[str, Any]:
    if not isinstance(variables, dict):
        return {}
    placeholders = variables.get("placeholders")
    if not isinstance(placeholders, dict):
        return {}
    return normalize_dynamic_variables(placeholders)


def merge_dynamic_variables(*sources: Any) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for source in sources:
        merged.update(normalize_dynamic_variables(source))
    return merged


def normalize_dynamic_variables(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}

    normalized: dict[str, Any] = {}
    for key, entry in value.items():
        name = str(key).strip()
        if not name or entry in (None, ""):
            continue
        normalized[name] = entry
    return normalized


def render_dynamic_variables(template: str, variables: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in variables:
            return match.group(0)
        return str(variables[key])

    return DYNAMIC_VARIABLE_TOKEN_RE.sub(replace, template)


def speak_first_message(session: Any, config: dict[str, Any]):
    first_message = (config.get("first_message") or "").strip()
    if not first_message:
        return None
    return session.say(first_message, allow_interruptions=True)


def parse_preview_user_transcript_packet(
    data: bytes | str,
    *,
    topic: str | None,
    participant_identity: str | None,
    preview_mode: bool,
) -> str | None:
    if not preview_mode:
        return None
    if topic != PREVIEW_TRANSCRIPT_TOPIC:
        return None
    if not participant_identity or not participant_identity.startswith("preview-user-"):
        return None

    try:
        raw = data.decode("utf-8") if isinstance(data, bytes) else data
        payload = json.loads(raw)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("type") != PREVIEW_TRANSCRIPT_TYPE:
        return None

    text = payload.get("text")
    if not isinstance(text, str):
        return None
    text = text.strip()
    return text or None


async def consume_preview_user_transcript_stream(
    reader: Any,
    *,
    participant_identity: str | None,
    preview_mode: bool,
    generate_reply: Callable[[str], Any],
) -> str | None:
    topic = getattr(getattr(reader, "info", None), "topic", PREVIEW_TRANSCRIPT_TOPIC)
    text = parse_preview_user_transcript_packet(
        await reader.read_all(),
        topic=topic,
        participant_identity=participant_identity,
        preview_mode=preview_mode,
    )
    if not text:
        return None

    logger.info("[preview] received browser transcript from text stream")
    generate_reply(text)
    return text


def _metadata_extras(metadata: dict[str, Any]) -> dict[str, Any]:
    extras: dict[str, Any] = {}
    for key, value in metadata.items():
        if key in ROUTING_METADATA_KEYS or key.startswith("sip."):
            continue
        if value in (None, ""):
            continue
        extras[key] = value
    return extras


def _numbers_from_room(room_name: str):
    parts = room_name.split("_", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return None, None


def _outbound_id_from_room(room_name: str):
    if room_name.startswith("outbound_"):
        outbound_id = room_name[len("outbound_") :].strip()
        return outbound_id or None
    return None


def _pick(source: dict[str, Any], *keys: str):
    for key in keys:
        value = source.get(key)
        if value not in (None, ""):
            return value
    return None
