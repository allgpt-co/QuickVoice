import asyncio
import json
import os
import sys
import unittest
from datetime import datetime, timezone
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from handlers.mcp_handler import _post_json, build_mcp_tool_instructions, describe_mcp_tool, call_mcp_tool
from utils.time import get_time_context
from main import Assistant, build_agent_instructions
from livekit.agents import ToolError

SCHEMA = {"type": "object", "properties": {"start_date": {"type": "string", "format": "date"}}, "additionalProperties": False}
CONFIG = {"mcp_connections": [{"mcpConnectionId": "calendar", "status": "CONNECTED", "tools": [
    {"name": "FindFree", "description": "Find free intervals for the current account.", "readOnly": True, "inputSchema": SCHEMA},
    {"name": "Delete", "sideEffect": True, "inputSchema": {"type": "object"}},
]}]}


class McpContractTests(unittest.TestCase):
    def test_contract_is_available_on_demand_and_not_guessed_from_the_tool_name(self):
        definition = describe_mcp_tool("calendar", "FindFree", CONFIG)
        self.assertEqual(definition["inputSchema"], SCHEMA)
        self.assertIn("free intervals", definition["description"])
        prompt = build_mcp_tool_instructions(CONFIG["mcp_connections"])
        self.assertIn("get_mcp_tool_schema", prompt)
        self.assertIn("additionalProperties", prompt)
        self.assertNotIn('"Delete"', prompt)

    def test_schema_lookup_preserves_attachment_and_confirmation_gates(self):
        for connection, name in [("foreign", "FindFree"), ("calendar", "Delete")]:
            with self.subTest(connection=connection, name=name), self.assertRaises(PermissionError):
                describe_mcp_tool(connection, name, CONFIG)

    def test_missing_schema_is_an_explicit_setup_error(self):
        config = {"mcp_connections": [{"mcpConnectionId": "c", "status": "CONNECTED", "tools": [{"name": "t", "readOnly": True}]}]}
        self.assertEqual(describe_mcp_tool("c", "t", config)["error"]["code"], "MCP_SCHEMA_UNAVAILABLE")

    def test_backend_validation_returns_actionable_feedback_without_provider_details(self):
        body = BytesIO(json.dumps({"code": "MCP_ARGUMENTS_INVALID", "message": "private upstream message", "details": {
            "inputSchema": SCHEMA, "issues": [{"field": "start_time", "keyword": "additionalProperties"}],
        }}).encode())
        with patch("handlers.mcp_handler.urlopen", side_effect=HTTPError("https://api.test", 422, "Invalid", {}, body)), patch("handlers.mcp_handler.emit_metric") as metric:
            result = asyncio.run(call_mcp_tool(connection_id="calendar", tool_name="FindFree", arguments={"start_time": "2026-10-27"},
                config=CONFIG, call_context={}, server_api_url="https://api.test", internal_api_key="test", post_json=_post_json))
        self.assertEqual(result["error"]["code"], "MCP_ARGUMENTS_INVALID")
        self.assertEqual(result["error"]["details"]["inputSchema"], SCHEMA)
        self.assertNotIn("temporarily unavailable", result["error"]["message"])
        self.assertNotIn("private upstream message", str(result))
        self.assertEqual(metric.call_args.kwargs["status"], "validation_error")
        self.assertTrue(body.closed)

    def test_clock_resolves_relative_dates_in_the_selected_timezone(self):
        now = datetime(2026, 12, 31, 20, 0, tzinfo=timezone.utc)
        utc = get_time_context("UTC", now=now)
        local = get_time_context("Asia/Kolkata", now=now)
        self.assertIn("Today: 2026-12-31", utc)
        self.assertIn("Tomorrow: 2027-01-01", utc)
        self.assertIn("Today: 2027-01-01", local)
        self.assertIn("Tomorrow: 2027-01-02", local)
        self.assertIn("+05:30", local)

    def test_clock_handles_dst_and_removes_the_old_booking_specific_instruction(self):
        result = get_time_context("America/New_York", now=datetime(2026, 11, 1, 6, 30, tzinfo=timezone.utc))
        self.assertIn("2026-11-01T01:30:00-05:00", result)
        self.assertIn("Tomorrow: 2026-11-02", result)
        self.assertNotIn("save_booking_intent", result)

    def test_real_agent_registers_schema_and_clock_tools_and_uses_the_saved_timezone(self):
        config = {**CONFIG, "timezone": "UTC"}
        agent = Assistant("Use the connected tools.", config, {})
        names = {tool.id for tool in agent.tools}
        self.assertIn("get_mcp_tool_schema", names)
        self.assertIn("get_current_time", names)
        self.assertEqual(json.loads(asyncio.run(agent.get_mcp_tool_schema("calendar", "FindFree")))["inputSchema"], SCHEMA)
        self.assertIn("(UTC)", asyncio.run(agent.get_current_time()))
        self.assertIn("Current date and time:", build_agent_instructions(config))
        with self.assertRaises(ToolError):
            asyncio.run(agent.get_current_time("not/a/timezone"))
        with self.assertRaises(ToolError):
            asyncio.run(agent.get_mcp_tool_schema("foreign", "FindFree"))

    def test_malformed_json_has_actionable_tool_feedback(self):
        agent = Assistant("Use attached tools.", CONFIG, {})
        with self.assertRaisesRegex(ToolError, "valid JSON"):
            asyncio.run(agent.call_mcp_tool("calendar", "FindFree", "broken JSON"))

    def test_validation_feedback_does_not_reintroduce_oauth_links_to_the_model(self):
        body = BytesIO(json.dumps({"code": "MCP_ARGUMENTS_INVALID", "details": {
            "inputSchema": {"description": "https://accounts.google.com/o/oauth2/auth?state=private-state"},
        }}).encode())
        with patch("handlers.mcp_handler.urlopen", side_effect=HTTPError("https://api.test", 422, "Invalid", {}, body)):
            result = asyncio.run(call_mcp_tool(connection_id="calendar", tool_name="FindFree", arguments={}, config=CONFIG,
                call_context={}, server_api_url="https://api.test", internal_api_key="test", post_json=_post_json))
        self.assertNotIn("private-state", str(result))


if __name__ == "__main__":
    unittest.main()
