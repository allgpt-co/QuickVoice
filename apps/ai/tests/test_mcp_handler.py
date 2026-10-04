import asyncio
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.mcp_handler import build_mcp_tool_instructions, call_mcp_tool, parse_arguments_json


class McpHandlerTests(unittest.TestCase):
    def test_build_mcp_tool_instructions_hides_side_effect_tools(self):
        instructions = build_mcp_tool_instructions(
            [
                {
                    "mcpConnectionId": "conn_123",
                    "displayName": "CRM",
                    "status": "CONNECTED",
                    "tools": [
                        {"name": "lookup_account", "readOnly": True},
                        {"name": "send_email", "sideEffect": True},
                        {"name": "unclassified_tool"},
                    ],
                }
            ]
        )

        self.assertIn("lookup_account", instructions)
        self.assertNotIn("send_email", instructions)
        self.assertNotIn("unclassified_tool", instructions)

    def test_call_mcp_tool_rejects_connections_and_tools_not_in_agent_config(self):
        async def run():
            with self.assertRaises(PermissionError):
                await call_mcp_tool(
                    connection_id="unknown",
                    tool_name="search",
                    arguments={},
                    config={"mcp_connections": []},
                    call_context={"call_id": "call_123"},
                    server_api_url="http://server.test",
                    internal_api_key="internal-secret",
                    post_json=lambda *_args: {},
                )

        asyncio.run(run())

    def test_call_mcp_tool_requires_confirmation_for_side_effect_tools(self):
        config = {
            "organization_id": "org_123",
            "user_id": "user_123",
            "agent_id": "agent_123",
            "mcp_connections": [
                {
                    "mcpConnectionId": "conn_123",
                    "status": "CONNECTED",
                    "tools": [{"name": "send_email", "sideEffect": True}],
                }
            ],
        }

        with self.assertRaises(PermissionError):
            asyncio.run(
                call_mcp_tool(
                    connection_id="conn_123",
                    tool_name="send_email",
                    arguments={"to": "customer@example.com"},
                    config=config,
                    call_context={"call_id": "call_123"},
                    server_api_url="http://server.test",
                    internal_api_key="internal-secret",
                    post_json=lambda *_args: {},
                )
            )

    def test_call_mcp_tool_rejects_unclassified_tools(self):
        config = {
            "mcp_connections": [
                {
                    "mcpConnectionId": "conn_123",
                    "status": "CONNECTED",
                    "tools": [{"name": "unknown_action"}],
                }
            ],
        }

        with self.assertRaises(PermissionError):
            asyncio.run(
                call_mcp_tool(
                    connection_id="conn_123",
                    tool_name="unknown_action",
                    arguments={},
                    config=config,
                    call_context={"call_id": "call_123"},
                    server_api_url="http://server.test",
                    internal_api_key="internal-secret",
                    post_json=lambda *_args: {},
                )
            )

    def test_call_mcp_tool_preserves_result_for_the_llm(self):
        calls = []

        def fake_post_json(url, headers, payload):
            calls.append((url, headers, payload))
            return {
                "data": {
                    "message": "Booked for 2026-10-01",
                    "date": "2026-10-01",
                    "order_id": "12345678901",
                    "phones": ["1-800-555-0199", "8005550199", "18005550199", "44 20 7946 0958"],
                    "sku": "800-555-0199",
                    "mrn": "12345678901",
                    "isbn": "978-1-4028-9462-6",
                    "coordinates": "+40.71281234, -74.00601234",
                }
            }

        result = asyncio.run(
            call_mcp_tool(
                connection_id="conn_123",
                tool_name="lookup_account",
                arguments={"phone": "+15550001111"},
                config={
                    "organization_id": "org_123",
                    "user_id": "user_123",
                    "agent_id": "agent_123",
                    "mcp_connections": [
                        {
                            "mcpConnectionId": "conn_123",
                            "status": "CONNECTED",
                            "tools": [{"name": "lookup_account", "readOnly": True}],
                        }
                    ],
                },
                call_context={"call_id": "call_123"},
                server_api_url="http://server.test",
                internal_api_key="internal-secret",
                post_json=fake_post_json,
            )
        )

        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][2]["arguments"], {"phone": "+15550001111"})
        self.assertEqual(
            result["data"],
            {
                "message": "Booked for 2026-10-01",
                "date": "2026-10-01",
                "order_id": "12345678901",
                "phones": ["1-800-555-0199", "8005550199", "18005550199", "44 20 7946 0958"],
                "sku": "800-555-0199",
                "mrn": "12345678901",
                "isbn": "978-1-4028-9462-6",
                "coordinates": "+40.71281234, -74.00601234",
            },
        )

    def test_parse_arguments_json_limits_size(self):
        with self.assertRaisesRegex(ValueError, "too large"):
            parse_arguments_json('{"value":"' + ("x" * 9000) + '"}')


if __name__ == "__main__":
    unittest.main()
