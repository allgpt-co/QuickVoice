import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.flow_handler import (
    build_flow_transfer_instructions,
    get_current_node_id,
    merge_agent_config_for_node,
    resolve_transfer_target,
)


def sample_config():
    return {
        "agent_id": "root-agent",
        "first_message": "Root hello",
        "system_prompt": "Root prompt",
        "llm_model": "openai/gpt-4o-mini",
        "stt_model": "deepgram/nova-3",
        "tts_model": "deepgram/aura-2",
        "voice": "root-voice",
        "use_rag": False,
        "tools": [{"toolId": "root-tool"}],
        "mcp_connections": [{"mcpConnectionId": "root-mcp"}],
        "flow": {
            "flowId": "flow-1",
            "compiled": {
                "startNodeId": "start",
                "outgoingByNodeId": {
                    "start": [
                        {
                            "id": "route-returns",
                            "target": "returns",
                            "data": {
                                "label": "Returns",
                                "condition": "Customer asks about returns",
                                "priority": 10,
                            },
                        }
                    ]
                },
                "nodesById": {
                    "start": {
                        "id": "start",
                        "type": "start",
                        "data": {"label": "General", "agentId": "root-agent"},
                    },
                    "returns": {
                        "id": "returns",
                        "type": "agent",
                        "data": {
                            "label": "Returns",
                            "agentId": "returns-agent",
                            "transferMessage": "I will connect you to returns.",
                        },
                    },
                },
                "agentsByNodeId": {
                    "returns": {
                        "agentId": "returns-agent",
                        "name": "Returns",
                        "firstMessage": "Returns hello",
                        "systemPrompt": "Returns prompt",
                        "llmModel": "gpt-4o",
                        "sttModel": "deepgram/nova-3",
                        "ttsModel": "deepgram/aura-2",
                        "voiceId": "returns-voice",
                        "use_rag": True,
                        "tools": [{"toolId": "returns-tool"}],
                        "mcpConnections": [{"mcpConnectionId": "returns-mcp"}],
                    }
                },
            },
        },
    }


class FlowHandlerTests(unittest.TestCase):
    def test_get_current_node_id_reads_start_node(self):
        self.assertEqual(get_current_node_id(sample_config()), "start")

    def test_build_flow_transfer_instructions_includes_route_ids_and_conditions(self):
        instructions = build_flow_transfer_instructions(sample_config(), "start")

        self.assertIn("transfer_to_flow_agent", instructions)
        self.assertIn("route_id=route-returns", instructions)
        self.assertIn("Customer asks about returns", instructions)

    def test_resolve_transfer_target_rejects_unknown_route_ids(self):
        self.assertIsNone(resolve_transfer_target(sample_config(), "start", "unknown"))

    def test_resolve_transfer_target_returns_target_node_and_message(self):
        target = resolve_transfer_target(sample_config(), "start", "route-returns")

        self.assertEqual(target["targetNodeId"], "returns")
        self.assertEqual(target["agentId"], "returns-agent")
        self.assertEqual(target["transferMessage"], "I will connect you to returns.")

    def test_merge_agent_config_for_node_swaps_runtime_agent_fields(self):
        merged = merge_agent_config_for_node(sample_config(), "returns")

        self.assertEqual(merged["agent_id"], "returns-agent")
        self.assertEqual(merged["first_message"], "Returns hello")
        self.assertEqual(merged["system_prompt"], "Returns prompt")
        self.assertEqual(merged["llm_model"], "openai/gpt-4o")
        self.assertEqual(merged["llm_provider"], "openai")
        self.assertEqual(merged["stt_model"], "deepgram/nova-3")
        self.assertEqual(merged["tts_model"], "deepgram/aura-2")
        self.assertEqual(merged["voice"], "returns-voice")
        self.assertTrue(merged["use_rag"])
        self.assertEqual(merged["tools"], [{"toolId": "returns-tool"}])
        self.assertEqual(merged["mcp_connections"], [{"mcpConnectionId": "returns-mcp"}])


if __name__ == "__main__":
    unittest.main()
