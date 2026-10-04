import asyncio
import json
import os
import sys
import threading
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.http_tool_handler import (
    build_http_tool_instructions,
    call_http_tool,
    parse_http_tool_arguments,
)


def sample_tool(**overrides):
    tool = {
        "toolId": "tool_123",
        "name": "Lookup customer",
        "description": "Fetches customer profile data",
        "api_url": "https://api.example.com/customers/{customerId}",
        "api_method": "POST",
        "api_headers": [{"key": "Authorization", "value": "Bearer test-secret"}],
        "api_path_params": [
            {
                "name": "customerId",
                "type": "String",
                "valueType": "LLM Prompt",
                "description": "Customer id",
                "allowedValues": [],
                "required": True,
            }
        ],
        "api_query_params": [
            {
                "name": "status",
                "type": "String",
                "valueType": "LLM Prompt",
                "description": "Requested profile status",
                "allowedValues": ["active", "pending"],
                "required": False,
            }
        ],
        "api_body": [
            {
                "name": "reason",
                "type": "String",
                "valueType": "LLM Prompt",
                "description": "Lookup reason",
                "allowedValues": [],
                "required": True,
            },
            {
                "name": "accountId",
                "type": "String",
                "valueType": "Dynamic Variable",
                "description": "Runtime account id",
                "allowedValues": [],
                "required": True,
            },
        ],
        "dynamic_variables": [{"key": "accountId", "value": "acct_default"}],
        "response_timeout_secs": 7,
    }
    tool.update(overrides)
    return tool


class HttpToolHandlerTests(unittest.TestCase):
    def test_build_http_tool_instructions_lists_only_llm_prompt_arguments(self):
        instructions = build_http_tool_instructions([sample_tool()])

        self.assertIn("call_http_tool", instructions)
        self.assertIn("Lookup customer", instructions)
        self.assertIn("customerId (String, required", instructions)
        self.assertIn("status (String, optional, allowed: active, pending", instructions)
        self.assertIn("reason (String, required", instructions)
        self.assertNotIn("test-secret", instructions)
        self.assertNotIn("accountId", instructions)

    def test_call_http_tool_builds_request_from_arguments_and_dynamic_variables(self):
        captured = {}

        def fake_fetch(payload):
            request = payload["request"]
            captured["url"] = request.full_url
            captured["method"] = request.get_method()
            captured["timeout"] = payload["timeout"]
            captured["authorization"] = request.get_header("Authorization")
            captured["body"] = json.loads(request.data.decode("utf-8"))
            return {"status": 200, "data": {"ok": True, "customer": "cust_123"}}

        result = asyncio.run(
            call_http_tool(
                tool_name="Lookup customer",
                arguments={
                    "customerId": "cust_123",
                    "status": "active",
                    "reason": "Caller requested account details",
                },
                config={
                    "tools": [sample_tool()],
                    "dynamic_variables": {"accountId": "acct_runtime"},
                },
                call_context={"call_id": "call_123"},
                fetch=fake_fetch,
            )
        )

        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["timeout"], 7)
        self.assertEqual(captured["authorization"], "Bearer test-secret")
        self.assertEqual(
            captured["url"],
            "https://api.example.com/customers/cust_123?status=active",
        )
        self.assertEqual(
            captured["body"],
            {
                "reason": "Caller requested account details",
                "accountId": "acct_runtime",
            },
        )
        self.assertEqual(result["status"], 200)
        self.assertEqual(result["data"]["customer"], "cust_123")

    def test_call_http_tool_preserves_confirmation_fields_for_the_llm(self):
        tool_result = {
            "status": 200,
            "data": {
                "message": "Booked for 2026-10-01",
                "date": "2026-10-01",
                "order_id": "12345678901",
                "phones": ["1-800-555-0199", "8005550199", "18005550199", "44 20 7946 0958"],
                "sku": "800-555-0199",
                "mrn": "12345678901",
                "isbn": "978-1-4028-9462-6",
                "coordinates": "+40.71281234, -74.00601234",
            },
        }

        result = asyncio.run(
            call_http_tool(
                tool_name="Lookup customer",
                arguments={"customerId": "cust_123", "reason": "Book appointment"},
                config={"tools": [sample_tool()]},
                call_context={},
                fetch=lambda _payload: tool_result,
            )
        )

        self.assertEqual(result, tool_result)

    def test_call_http_tool_clamps_timeout_and_cancels_active_request(self):
        started = threading.Event()
        connection_closed = threading.Event()

        class FakeConnection:
            def close(self):
                connection_closed.set()

        def hanging_fetch(payload):
            payload["_connection_observer"](FakeConnection())
            started.set()
            connection_closed.wait(1)
            return {"status": 200}

        async def run_and_cancel():
            task = asyncio.create_task(
                call_http_tool(
                    tool_name="Lookup customer",
                    arguments={"customerId": "cust_123", "reason": "lookup"},
                    config={"tools": [sample_tool(response_timeout_secs=300)]},
                    call_context={},
                    fetch=hanging_fetch,
                )
            )
            while not started.is_set():
                await asyncio.sleep(0)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task

        asyncio.run(run_and_cancel())

        self.assertTrue(connection_closed.is_set())

        captured = {}

        def capture_timeout(payload):
            captured["timeout"] = payload["timeout"]
            return {"status": 200}

        asyncio.run(
            call_http_tool(
                tool_name="Lookup customer",
                arguments={"customerId": "cust_123", "reason": "lookup"},
                config={"tools": [sample_tool(response_timeout_secs=300)]},
                call_context={},
                fetch=capture_timeout,
            )
        )
        self.assertEqual(captured["timeout"], 15)

    def test_call_http_tool_rejects_missing_required_argument(self):
        with self.assertRaisesRegex(ValueError, "customerId"):
            asyncio.run(
                call_http_tool(
                    tool_name="Lookup customer",
                    arguments={"reason": "Need profile"},
                    config={"tools": [sample_tool()]},
                    call_context={},
                    fetch=lambda payload: {"status": 200},
                )
            )

    def test_parse_http_tool_arguments_requires_json_object(self):
        with self.assertRaisesRegex(ValueError, "decode to an object"):
            parse_http_tool_arguments("[1,2,3]")

    def test_missing_dynamic_identity_cannot_fall_back_to_llm_arguments(self):
        requests = []
        with self.assertRaisesRegex(ValueError, "accountId"):
            asyncio.run(call_http_tool(
                tool_name="Lookup customer",
                arguments={"customerId": "cust_123", "reason": "lookup", "accountId": "victim"},
                config={"tools": [sample_tool(dynamic_variables=[])]},
                call_context={},
                fetch=lambda payload: requests.append(payload),
            ))
        self.assertEqual(requests, [])


if __name__ == "__main__":
    unittest.main()

class ParameterTrustTests(unittest.TestCase):
    def test_static_parameters_never_fall_back_to_llm_arguments(self):
        from handlers.http_tool_handler import _param_values
        param = {"name": "account", "valueType": "Static Value"}
        self.assertEqual(_param_values([param], {"account": "victim"}, {}, {}), {})
        with self.assertRaisesRegex(ValueError, "Missing required"):
            _param_values([{**param, "required": True}], {"account": "victim"}, {}, {})

    def test_visitor_tool_and_trusted_runtime_precedence(self):
        from handlers.http_tool_handler import _dynamic_variables
        tool = {"dynamic_variables": [{"key": "customer_id", "value": "tenant"}]}
        self.assertEqual(_dynamic_variables({"dynamic_variables": {"customer_id": "victim"}, "visitor_dynamic_variable_keys": ["customer_id"]}, tool)["customer_id"], "tenant")
        self.assertEqual(_dynamic_variables({"dynamic_variables": {"customer_id": "trusted"}}, tool)["customer_id"], "trusted")
