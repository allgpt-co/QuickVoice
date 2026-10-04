import asyncio
import json
import socket
import threading
import time
from typing import Any
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit
from urllib.request import Request

from handlers.mcp_handler import parse_arguments_json, truncate_tool_result
from utils.metrics import emit_metric
from utils.safe_http import safe_https_request


MAX_HTTP_TOOL_RESPONSE_BYTES = 256_000
MAX_HTTP_TOOL_TIMEOUT_SECONDS = 15


def build_http_tool_instructions(tools: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for tool in tools or []:
        name = str(tool.get("name") or "").strip()
        url = str(tool.get("api_url") or "").strip()
        if not name or not url:
            continue

        description = str(tool.get("description") or "No description").strip()
        method = str(tool.get("api_method") or "POST").upper()
        arguments = _instruction_arguments(tool)
        argument_text = f"; arguments: {arguments}" if arguments else "; no arguments"
        lines.append(f"- {name} ({method}): {description}{argument_text}")

    if not lines:
        return ""

    return (
        "\n\nAttached HTTP tools are available through call_http_tool. "
        "Use the exact tool_name from this list and pass arguments_json as a JSON object "
        "containing only the needed LLM Prompt arguments:\n"
        + "\n".join(lines)
    )


async def call_http_tool(
    *,
    tool_name: str,
    arguments: dict[str, Any],
    config: dict[str, Any],
    call_context: dict[str, Any],
    fetch=None,
) -> Any:
    started = time.perf_counter()
    try:
        tool = _resolve_tool(config.get("tools") or [], tool_name)
        request = _build_tool_request(
            tool=tool,
            arguments=arguments or {},
            config=config,
            call_context=call_context,
        )
        result = await _run_tool_request(fetch or _fetch_tool_request, request)
        emit_metric(
            "http_tool_execution",
            status="ok",
            tool_name=tool_name,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        return truncate_tool_result(result)
    except Exception:
        emit_metric(
            "http_tool_execution",
            status="error",
            tool_name=tool_name,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        raise


def parse_http_tool_arguments(arguments_json: str | None) -> dict[str, Any]:
    return parse_arguments_json(arguments_json)


def _instruction_arguments(tool: dict[str, Any]) -> str:
    params = []
    for location in ("api_path_params", "api_query_params", "api_body"):
        for param in _list(tool.get(location)):
            if not isinstance(param, dict):
                continue
            if _value_type(param) != "llm prompt":
                continue
            name = str(param.get("name") or "").strip()
            if not name:
                continue
            required = "required" if bool(param.get("required")) else "optional"
            kind = str(param.get("type") or "String")
            description = str(param.get("description") or "").strip()
            allowed = _allowed_values_text(_allowed_values(param))
            suffix = f", {description}" if description else ""
            params.append(f"{name} ({kind}, {required}{allowed}{suffix})")
    return "; ".join(params)


def _allowed_values(param: dict[str, Any]) -> Any:
    return param.get("allowedValues") if "allowedValues" in param else param.get("enum_values")


def _allowed_values_text(value: Any) -> str:
    allowed = [str(item) for item in _list(value) if str(item).strip()]
    if not allowed:
        return ""
    return f", allowed: {', '.join(allowed)}"


def _resolve_tool(tools: list[dict[str, Any]], tool_name: str) -> dict[str, Any]:
    normalized = str(tool_name or "").strip()
    if not normalized:
        raise ValueError("tool_name is required")
    for tool in tools:
        if str(tool.get("name") or "") == normalized or str(tool.get("toolId") or "") == normalized:
            return tool
    raise PermissionError("HTTP tool is not attached to this agent")


def _build_tool_request(
    *,
    tool: dict[str, Any],
    arguments: dict[str, Any],
    config: dict[str, Any],
    call_context: dict[str, Any],
) -> dict[str, Any]:
    method = str(tool.get("api_method") or "POST").upper()
    if method not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
        raise ValueError("Unsupported HTTP tool method")

    url = _render_path_params(str(tool.get("api_url") or ""), tool.get("api_path_params"), arguments, config, tool)
    query = _param_values(tool.get("api_query_params"), arguments, config, tool)
    url = _append_query_params(url, query)
    headers = _headers_from_pairs(tool.get("api_headers"))
    headers.setdefault("Accept", "application/json")

    body_values = _param_values(tool.get("api_body"), arguments, config, tool)
    body = None
    if body_values and method in {"POST", "PUT", "PATCH", "DELETE"}:
        headers.setdefault("Content-Type", "application/json")
        body = json.dumps(body_values).encode("utf-8")

    timeout = _timeout(tool.get("response_timeout_secs"))
    request = Request(url, data=body, headers=headers, method=method)
    return {
        "request": request,
        "timeout": timeout,
        "tool_name": tool.get("name"),
        "call_id": call_context.get("call_id"),
    }


def _render_path_params(
    url: str,
    params: Any,
    arguments: dict[str, Any],
    config: dict[str, Any],
    tool: dict[str, Any],
) -> str:
    rendered = url
    for param in _list(params):
        if not isinstance(param, dict):
            continue
        name = str(param.get("name") or "").strip()
        if not name:
            continue
        value = _value_for_param(param, arguments, config, tool)
        if _is_missing(value):
            if bool(param.get("required")) or f"{{{name}}}" in rendered:
                raise ValueError(f"Missing required tool argument: {name}")
            continue
        _assert_allowed_value(name, value, _allowed_values(param))
        value = _coerce_value(value, str(param.get("type") or "String"))
        rendered = rendered.replace(f"{{{name}}}", quote(str(value), safe=""))
    if "{" in rendered or "}" in rendered:
        raise ValueError("Tool URL has unresolved path parameters")
    return rendered


def _param_values(
    params: Any,
    arguments: dict[str, Any],
    config: dict[str, Any],
    tool: dict[str, Any],
) -> dict[str, Any]:
    values: dict[str, Any] = {}
    for param in _list(params):
        if not isinstance(param, dict):
            continue
        name = str(param.get("name") or "").strip()
        if not name:
            continue
        value = _value_for_param(param, arguments, config, tool)
        if _is_missing(value):
            if bool(param.get("required")):
                raise ValueError(f"Missing required tool argument: {name}")
            continue
        _assert_allowed_value(name, value, _allowed_values(param))
        values[name] = _coerce_value(value, str(param.get("type") or "String"))
    return values


def _value_for_param(
    param: dict[str, Any],
    arguments: dict[str, Any],
    config: dict[str, Any],
    tool: dict[str, Any],
) -> Any:
    name = str(param.get("name") or "").strip()
    value_type = _value_type(param)
    if value_type == "dynamic variable":
        dynamic_variables = _dynamic_variables(config, tool)
        variable_key = str(param.get("value") or name).strip()
        if variable_key in dynamic_variables:
            return dynamic_variables[variable_key]
        if name in dynamic_variables:
            return dynamic_variables[name]
        # A missing configured variable must not become a caller/LLM-supplied
        # identity. Required parameters fail validation before making a request.
        return None
    if value_type == "static value":
        for key in ("value", "staticValue", "static_value"):
            if key in param:
                return param.get(key)
        return None
    return arguments.get(name)


def _dynamic_variables(config: dict[str, Any], tool: dict[str, Any]) -> dict[str, Any]:
    config_vars = config.get("dynamic_variables")
    config_vars = config_vars if isinstance(config_vars, dict) else {}
    visitor_keys = set(config.get("visitor_dynamic_variable_keys") or [])
    merged = {key: value for key, value in config_vars.items() if key in visitor_keys}
    for pair in _list(tool.get("dynamic_variables")):
        if isinstance(pair, dict) and pair.get("key"):
            merged[str(pair["key"])] = pair.get("value")
    merged.update({key: value for key, value in config_vars.items() if key not in visitor_keys})
    return merged


def _headers_from_pairs(value: Any) -> dict[str, str]:
    headers: dict[str, str] = {}
    for pair in _list(value):
        if not isinstance(pair, dict):
            continue
        key = str(pair.get("key") or "").strip()
        val = pair.get("value")
        if not key or val in (None, ""):
            continue
        headers[key] = str(val)
    return headers


def _append_query_params(url: str, params: dict[str, Any]) -> str:
    if not params:
        return url
    parts = urlsplit(url)
    query = parse_qsl(parts.query, keep_blank_values=True)
    query.extend((key, value) for key, value in params.items())
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query, doseq=True), parts.fragment))


def _fetch_tool_request(payload: dict[str, Any]) -> Any:
    request = payload["request"]
    timeout = payload["timeout"]
    response = safe_https_request(
        request,
        timeout=timeout,
        max_response_bytes=MAX_HTTP_TOOL_RESPONSE_BYTES,
        cancellation_event=payload.get("_cancellation_event"),
        connection_observer=payload.get("_connection_observer"),
    )

    raw = response.body.decode("utf-8", errors="replace")
    parsed = _parse_response_body(raw, response.content_type)
    return {
        "status": response.status,
        "data": parsed,
    }


def _parse_response_body(raw: str, content_type: str) -> Any:
    if not raw.strip():
        return {}
    if "json" in content_type.lower():
        return json.loads(raw)
    try:
        return json.loads(raw)
    except Exception:
        return raw


def _assert_allowed_value(name: str, value: Any, allowed_values: Any) -> None:
    allowed = [str(item) for item in _list(allowed_values) if str(item).strip()]
    if allowed and str(value) not in allowed:
        raise ValueError(f"Invalid value for {name}; allowed values: {', '.join(allowed)}")


def _coerce_value(value: Any, kind: str) -> Any:
    normalized_kind = kind.strip().lower()
    if normalized_kind == "number":
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return value
        text = str(value).strip()
        try:
            return int(text) if text.isdigit() or (text.startswith("-") and text[1:].isdigit()) else float(text)
        except ValueError as error:
            raise ValueError(f"Expected number value, got {value}") from error
    if normalized_kind == "boolean":
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"1", "true", "yes", "on"}:
            return True
        if text in {"0", "false", "no", "off"}:
            return False
        raise ValueError(f"Expected boolean value, got {value}")
    return str(value)


def _value_type(param: dict[str, Any]) -> str:
    return str(param.get("valueType") or param.get("value_type") or "LLM Prompt").strip().lower()


def _timeout(value: Any) -> int:
    try:
        timeout = int(value)
    except (TypeError, ValueError):
        timeout = MAX_HTTP_TOOL_TIMEOUT_SECONDS
    return max(1, min(timeout, MAX_HTTP_TOOL_TIMEOUT_SECONDS))


async def _run_tool_request(fetch, payload: dict[str, Any]) -> Any:
    cancellation_event = threading.Event()
    active_connections = []
    cancellable_payload = {
        **payload,
        "_cancellation_event": cancellation_event,
        "_connection_observer": active_connections.append,
    }
    task = asyncio.create_task(asyncio.to_thread(fetch, cancellable_payload))

    def cancel_request() -> None:
        cancellation_event.set()
        for connection in active_connections:
            connection_socket = getattr(connection, "sock", None)
            if connection_socket is not None:
                try:
                    connection_socket.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass
            try:
                connection.close()
            except Exception:
                pass

    try:
        return await asyncio.wait_for(task, timeout=payload["timeout"])
    except TimeoutError as error:
        cancel_request()
        raise TimeoutError("HTTP tool request timed out") from error
    except asyncio.CancelledError:
        cancel_request()
        raise


def _is_missing(value: Any) -> bool:
    return value is None or value == ""


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []
