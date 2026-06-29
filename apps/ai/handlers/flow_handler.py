from copy import deepcopy

from handlers.config_handler import normalize_config


def get_current_node_id(config: dict) -> str | None:
    flow = config.get("flow") or {}
    compiled = flow.get("compiled") or {}
    return compiled.get("startNodeId")


def get_outgoing_routes(config: dict, node_id: str) -> list[dict]:
    compiled = (config.get("flow") or {}).get("compiled") or {}
    return (compiled.get("outgoingByNodeId") or {}).get(node_id) or []


def build_flow_transfer_instructions(config: dict, node_id: str) -> str:
    routes = get_outgoing_routes(config, node_id)
    if not routes:
        return ""
    lines = []
    for route in routes:
        data = route.get("data") or {}
        lines.append(
            f"- route_id={route.get('id')}; label={data.get('label')}; condition={data.get('condition') or 'fallback'}"
        )
    return (
        "\n\nFlow routing is available through transfer_to_flow_agent. "
        "Call it only when the customer's request clearly matches one route. "
        "Available routes:\n" + "\n".join(lines)
    )


def append_flow_path(call_context: dict, node_id: str, agent_id: str | None, reason: str | None = None):
    path = call_context.setdefault("flow_path", [])
    path.append({"node_id": node_id, "agent_id": agent_id, "reason": reason})


def resolve_transfer_target(config: dict, node_id: str, route_id: str) -> dict | None:
    route = next(
        (candidate for candidate in get_outgoing_routes(config, node_id) if candidate.get("id") == route_id),
        None,
    )
    if not route:
        return None

    target_node_id = route.get("target")
    if not target_node_id:
        return None

    compiled = (config.get("flow") or {}).get("compiled") or {}
    nodes_by_id = compiled.get("nodesById") or {}
    agents_by_node_id = compiled.get("agentsByNodeId") or {}
    target_node = nodes_by_id.get(target_node_id) or {}
    target_data = target_node.get("data") or {}
    agent_config = agents_by_node_id.get(target_node_id) or {}
    agent_id = agent_config.get("agentId") or target_data.get("agentId")

    return {
        "routeId": route_id,
        "targetNodeId": target_node_id,
        "agentId": agent_id,
        "transferMessage": target_data.get("transferMessage"),
        "node": target_node,
        "agentConfig": agent_config,
    }


def merge_agent_config_for_node(config: dict, node_id: str) -> dict:
    compiled = (config.get("flow") or {}).get("compiled") or {}
    agents_by_node_id = compiled.get("agentsByNodeId") or {}
    agent_config = agents_by_node_id.get(node_id)
    if not agent_config:
        return dict(config)

    merged = deepcopy(config)
    normalized_agent_config = normalize_config(
        {
            "agentId": agent_config.get("agentId"),
            "firstMessage": agent_config.get("firstMessage"),
            "systemPrompt": agent_config.get("systemPrompt"),
            "llmModel": agent_config.get("llmModel"),
            "sttModel": agent_config.get("sttModel"),
            "ttsModel": agent_config.get("ttsModel"),
            "voiceId": agent_config.get("voiceId"),
            "agent_language": merged.get("agent_language"),
            "use_rag": agent_config.get("use_rag"),
            "tools": agent_config.get("tools", merged.get("tools", [])),
            "mcpConnections": agent_config.get(
                "mcpConnections",
                agent_config.get("mcp_connections", merged.get("mcp_connections", [])),
            ),
        }
    )
    merged.update(
        {
            "agent_id": normalized_agent_config.get("agent_id"),
            "first_message": normalized_agent_config.get("first_message"),
            "system_prompt": normalized_agent_config.get("system_prompt"),
            "llm_model": normalized_agent_config.get("llm_model"),
            "llm_provider": normalized_agent_config.get("llm_provider"),
            "stt_model": normalized_agent_config.get("stt_model"),
            "tts_model": normalized_agent_config.get("tts_model"),
            "voice": normalized_agent_config.get("voice"),
            "use_rag": normalized_agent_config.get("use_rag", False),
            "tools": normalized_agent_config.get("tools", []),
            "mcp_connections": normalized_agent_config.get("mcp_connections", []),
        }
    )
    return merged


def score_condition(message: str, condition: str) -> int:
    words = {word.strip(".,!?").lower() for word in message.split() if len(word) > 3}
    condition_words = {word.strip(".,!?").lower() for word in condition.split() if len(word) > 3}
    return len(words & condition_words)


def simulate_flow_messages(config: dict, messages: list[dict]) -> dict:
    compiled = (config.get("flow") or {}).get("compiled") or {}
    start_node_id = compiled.get("startNodeId")
    nodes_by_id = compiled.get("nodesById") or {}
    agents_by_node_id = compiled.get("agentsByNodeId") or {}
    outgoing_by_node_id = compiled.get("outgoingByNodeId") or {}
    warnings = []
    selected_routes = []
    path = []

    if not start_node_id:
        return {
            "success": False,
            "path": path,
            "selectedRoutes": selected_routes,
            "warnings": ["Flow has no start node"],
        }

    current_node_id = start_node_id
    start_node = nodes_by_id.get(current_node_id) or {}
    start_agent = (agents_by_node_id.get(current_node_id) or {}).get("agentId") or (start_node.get("data") or {}).get("agentId")
    path.append({"nodeId": current_node_id, "agentId": start_agent, "reason": None})

    for message in messages:
        if message.get("role") != "user":
            continue

        routes = outgoing_by_node_id.get(current_node_id) or []
        if not routes:
            warnings.append(f"Node {current_node_id} has no outgoing routes")
            continue

        best_route = None
        best_score = 0
        default_route = None
        content = str(message.get("content") or "")
        for route in routes:
            if route.get("type") == "default" and default_route is None:
                default_route = route
                continue
            score = score_condition(content, ((route.get("data") or {}).get("condition") or ""))
            if score > best_score:
                best_score = score
                best_route = route

        reason = None
        if best_route is not None and best_score > 0:
            route = best_route
            reason = f"Matched {best_score} condition word(s)"
        elif default_route is not None:
            route = default_route
            reason = "Default route"
        else:
            warnings.append(f"No route matched from node {current_node_id}")
            continue

        target_node_id = route.get("target")
        if not target_node_id:
            warnings.append(f"Route {route.get('id')} has no target")
            continue

        target_node = nodes_by_id.get(target_node_id) or {}
        target_agent = (agents_by_node_id.get(target_node_id) or {}).get("agentId") or (target_node.get("data") or {}).get("agentId")
        selected_routes.append(
            {
                "routeId": route.get("id"),
                "sourceNodeId": current_node_id,
                "targetNodeId": target_node_id,
                "reason": reason,
            }
        )
        path.append({"nodeId": target_node_id, "agentId": target_agent, "reason": reason})
        current_node_id = target_node_id

        if target_node.get("type") == "end":
            break

    return {"success": True, "path": path, "selectedRoutes": selected_routes, "warnings": warnings}
