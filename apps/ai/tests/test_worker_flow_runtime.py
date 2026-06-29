import asyncio
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from main import FlowAssistant


def flow_config():
    return {
        "agent_id": "11111111-1111-4111-8111-111111111111",
        "first_message": "Root hello",
        "system_prompt": "Root prompt",
        "llm_model": "openai/gpt-4o-mini",
        "llm_provider": "openai",
        "stt_model": "deepgram/nova-3",
        "tts_model": "deepgram/aura-2",
        "voice": "asteria",
        "use_rag": False,
        "tools": [],
        "mcp_connections": [],
        "flow": {
            "flowId": "44444444-4444-4444-8444-444444444444",
            "compiled": {
                "startNodeId": "start",
                "outgoingByNodeId": {
                    "start": [
                        {
                            "id": "route-returns",
                            "target": "returns",
                            "data": {"label": "Returns", "condition": "Customer asks about returns"},
                        }
                    ],
                    "returns": [
                        {
                            "id": "route-billing",
                            "target": "billing",
                            "data": {"label": "Billing", "condition": "Customer asks about billing"},
                        }
                    ],
                },
                "nodesById": {
                    "returns": {
                        "id": "returns",
                        "type": "agent",
                        "data": {
                            "label": "Returns",
                            "agentId": "22222222-2222-4222-8222-222222222222",
                            "transferMessage": "I will connect you to returns.",
                        },
                    },
                    "billing": {
                        "id": "billing",
                        "type": "agent",
                        "data": {
                            "label": "Billing",
                            "agentId": "33333333-3333-4333-8333-333333333333",
                            "transferMessage": "I will connect you to billing.",
                        },
                    }
                },
                "agentsByNodeId": {
                    "returns": {
                        "agentId": "22222222-2222-4222-8222-222222222222",
                        "name": "Returns",
                        "firstMessage": "Returns hello",
                        "systemPrompt": "Returns prompt",
                        "llmModel": "gpt-4o",
                        "sttModel": "nova-3",
                        "ttsModel": "aura-2",
                        "voiceId": "aura-2-asteria-en",
                        "use_rag": False,
                        "tools": [],
                        "mcpConnections": [],
                    },
                    "billing": {
                        "agentId": "33333333-3333-4333-8333-333333333333",
                        "name": "Billing",
                        "firstMessage": "Billing hello",
                        "systemPrompt": "Billing prompt",
                        "llmModel": "gpt-4o",
                        "sttModel": "nova-3",
                        "ttsModel": "aura-2",
                        "voiceId": "aura-2-asteria-en",
                        "use_rag": False,
                        "tools": [],
                        "mcpConnections": [],
                    }
                },
            },
        },
    }


class WorkerFlowRuntimeTests(unittest.TestCase):
    def test_transfer_to_flow_agent_appends_path_to_shared_call_context(self):
        class FakeSession:
            def __init__(self):
                self.messages = []

            async def say(self, message, allow_interruptions=True):
                self.messages.append((message, allow_interruptions))

        call_context = {"agent_id": "11111111-1111-4111-8111-111111111111"}
        session = FakeSession()
        agent = FlowAssistant("Root prompt", flow_config(), call_context, node_id="start")
        agent._get_activity_or_raise = lambda: SimpleNamespace(session=session)

        with patch("main.build_agent_pipeline_kwargs", return_value={}):
            child = asyncio.run(
                agent.transfer_to_flow_agent._func(agent, "route-returns", "Customer needs returns")
            )
            child._get_activity_or_raise = lambda: SimpleNamespace(session=session)
            grandchild = asyncio.run(
                child.transfer_to_flow_agent._func(child, "route-billing", "Customer needs billing")
            )

        self.assertIsInstance(child, FlowAssistant)
        self.assertIsInstance(grandchild, FlowAssistant)
        self.assertEqual(
            session.messages,
            [("I will connect you to returns.", False), ("I will connect you to billing.", False)],
        )
        self.assertEqual(call_context["agent_id"], "22222222-2222-4222-8222-222222222222")
        self.assertEqual(call_context["flow_state"], {"agent_id": "33333333-3333-4333-8333-333333333333"})
        self.assertEqual(
            call_context["flow_path"],
            [
                {
                    "node_id": "returns",
                    "agent_id": "22222222-2222-4222-8222-222222222222",
                    "reason": "Customer needs returns",
                },
                {
                    "node_id": "billing",
                    "agent_id": "33333333-3333-4333-8333-333333333333",
                    "reason": "Customer needs billing",
                },
            ],
        )
        self.assertIs(child._call_context["flow_path"], call_context["flow_path"])
        self.assertIs(grandchild._call_context["flow_path"], call_context["flow_path"])
        self.assertIs(grandchild._call_context["flow_state"], call_context["flow_state"])


if __name__ == "__main__":
    unittest.main()
