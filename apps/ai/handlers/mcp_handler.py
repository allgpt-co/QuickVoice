import asyncio
import json
import os
import time
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

from utils.logger import redact_sensitive
from utils.metrics import emit_metric

MAX_ARGUMENTS_JSON_BYTES = 8192
MAX_TOOL_OUTPUT_CHARS = 4000


def build_mcp_tool_instructions(connections: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for connection in connections or []:
        if connection.get("status") != "CONNECTED":
            continue
        tools = [tool for tool in connection.get("tools") or [] if not _tool_requires_confirmation(tool)]
        if not tools:
            continue
        connection_id = connection.get("mcpConnectionId")
        display_name = connection.get("displayName") or "MCP connection"
        tool_names = ", ".join(str(tool.get("name")) for tool in tools if tool.get("name"))
        if connection_id and tool_names:
            lines.append(f"- {display_name} connection_id={connection_id}; tools: {tool_names}")

    if not lines:
        return ""

    return (
        "\n\nConnected MCP tools are available through call_mcp_tool. "
        "Use the exact connection_id and tool_name from this list:\n" + "\n".join(lines)
    )


async def call_mcp_tool(
    *,
    connection_id: str,
    tool_name: str,
    arguments: dict[str, Any],
    config: dict[str, Any],
    call_context: dict[str, Any],
    server_api_url: str | None = None,
    internal_api_key: str | None = None,
    post_json=None,
    tracer: Any = None,
):
    started = time.perf_counter()
    sanitized_arguments = dict(arguments or {})
    try:
        tool = _resolve_allowed_tool(config.get("mcp_connections") or [], connection_id, tool_name)
        if _tool_requires_confirmation(tool):
            raise PermissionError("MCP tool requires trusted user confirmation before execution")

        base_url = (server_api_url or os.getenv("SERVER_API_URL") or "").rstrip("/")
        api_key = internal_api_key or os.getenv("INTERNAL_API_KEY")
        if not base_url:
            raise RuntimeError("SERVER_API_URL is required to execute MCP tools")
        if not api_key:
            raise RuntimeError("INTERNAL_API_KEY is required to execute MCP tools")

        api_base_url = base_url if base_url.endswith("/api/v1") else f"{base_url}/api/v1"
        encoded_connection_id = quote(connection_id, safe="")
        encoded_tool_name = quote(tool_name, safe="")
        url = f"{api_base_url}/mcp/connections/{encoded_connection_id}/tools/{encoded_tool_name}/execute"
        payload = {
            "organizationId": config.get("organization_id"),
            "userId": config.get("user_id") or "internal",
            "agentId": config.get("agent_id"),
            "callId": call_context.get("call_id"),
            "arguments": sanitized_arguments,
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "x-organization-id": str(config.get("organization_id") or ""),
            "x-user-id": str(config.get("user_id") or "internal"),
        }
        result = await asyncio.to_thread(post_json or _post_json, url, headers, payload)
        latency_ms = int((time.perf_counter() - started) * 1000)
        emit_metric(
            "mcp_tool_execution",
            status="ok",
            connection_id=connection_id,
            tool_name=tool_name,
            latency_ms=latency_ms,
        )
        final_res = _redact_and_truncate_result(result)
        if tracer and hasattr(tracer, "trace_tool_call"):
            tracer.trace_tool_call(tool_name, "mcp", sanitized_arguments, final_res, latency_ms)
        return final_res
    except Exception as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        emit_metric(
            "mcp_tool_execution",
            status="error",
            connection_id=connection_id,
            tool_name=tool_name,
            latency_ms=latency_ms,
        )
        if tracer and hasattr(tracer, "trace_tool_call"):
            tracer.trace_tool_call(tool_name, "mcp", sanitized_arguments, None, latency_ms, error=str(exc))
        raise



def parse_arguments_json(arguments_json: str | None) -> dict[str, Any]:
    if not arguments_json:
        return {}
    if len(arguments_json.encode("utf-8")) > MAX_ARGUMENTS_JSON_BYTES:
        raise ValueError("arguments_json is too large")
    try:
        parsed = json.loads(arguments_json)
    except Exception as exc:
        raise ValueError("arguments_json must be valid JSON") from exc
    if not isinstance(parsed, dict):
        raise ValueError("arguments_json must decode to an object")
    return parsed


def _resolve_allowed_tool(
    connections: list[dict[str, Any]],
    connection_id: str,
    tool_name: str,
) -> dict[str, Any]:
    for connection in connections:
        if connection.get("status") != "CONNECTED":
            continue
        if str(connection.get("mcpConnectionId") or "") != str(connection_id):
            continue
        for tool in connection.get("tools") or []:
            if str(tool.get("name") or "") == str(tool_name):
                return tool
        raise PermissionError("MCP tool is not allowlisted for this agent")
    raise PermissionError("MCP connection is not allowlisted for this agent")


def _tool_requires_confirmation(tool: dict[str, Any]) -> bool:
    if bool(tool.get("requiresConfirmation")) or bool(tool.get("sideEffect")):
        return True
    mode = str(tool.get("mode") or tool.get("type") or "").lower()
    if mode in {"write", "mutation", "side_effect"}:
        return True
    if tool.get("readOnly") is True:
        return False
    return False


def _redact_and_truncate_result(result: Any) -> Any:
    redacted = redact_sensitive(result)
    serialized = json.dumps(redacted, ensure_ascii=False)
    if len(serialized) <= MAX_TOOL_OUTPUT_CHARS:
        return redacted
    return {
        "truncated": True,
        "data": serialized[:MAX_TOOL_OUTPUT_CHARS],
    }


def _post_json(url: str, headers: dict[str, str], payload: dict[str, Any]):
    body = json.dumps(payload).encode("utf-8")
    request = Request(url, data=body, headers=headers, method="POST")
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))
