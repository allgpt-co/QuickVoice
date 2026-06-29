import asyncio
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from livekit.agents import llm

from main import Assistant, FlowAssistant, build_agent_instructions, build_agent_pipeline_kwargs


def tool_names(agent: Assistant) -> list[str]:
    return [tool._info.name for tool in agent.tools]


class RagRuntimeTests(unittest.TestCase):
    def test_assistant_exposes_knowledge_base_search_tool(self):
        agent = Assistant(
            "You are helpful.",
            {"use_rag": True, "agent_id": "agent_123"},
            {"agent_id": "agent_123"},
        )

        self.assertIn("search_knowledge_base", tool_names(agent))


    def test_build_agent_pipeline_kwargs_uses_configured_models(self):
        config = {
            "agent_language": "en-US",
            "stt_model": "deepgram/nova-3",
            "llm_model": "openai/gpt-4o",
            "llm_provider": "openai",
            "tts_model": "elevenlabs/eleven-flash-v2.5",
            "voice": "voice-123",
        }

        with (
            patch("main.inference.STT", return_value="stt") as stt_cls,
            patch("main.inference.LLM", return_value="llm") as llm_cls,
            patch("main.inference.TTS", return_value="tts") as tts_cls,
        ):
            kwargs = build_agent_pipeline_kwargs(config)

        self.assertEqual(kwargs, {"stt": "stt", "llm": "llm", "tts": "tts"})
        self.assertEqual(stt_cls.call_args.kwargs["model"], "deepgram/nova-3")
        self.assertEqual(llm_cls.call_args.kwargs["model"], "openai/gpt-4o")
        self.assertEqual(llm_cls.call_args.kwargs["provider"], "openai")
        self.assertEqual(tts_cls.call_args.kwargs["model"], "elevenlabs/eleven-flash-v2.5")
        self.assertEqual(tts_cls.call_args.kwargs["voice"], "voice-123")

    def test_flow_assistant_exposes_transfer_tool(self):
        agent = FlowAssistant(
            "You are helpful.",
            {"use_rag": False, "agent_id": "agent_123"},
            {"agent_id": "agent_123"},
            node_id="start",
        )

        self.assertIn("transfer_to_flow_agent", tool_names(agent))

    def test_flow_assistant_ends_call_for_end_node_route(self):
        class FakeSession:
            def __init__(self):
                self.messages = []
                self.shutdown_drains = []
                self.close_callback = None

            async def say(self, message, allow_interruptions=True):
                self.messages.append((message, allow_interruptions))

            def once(self, event, callback):
                if event == "close":
                    self.close_callback = callback

            def shutdown(self, *, drain=True):
                self.shutdown_drains.append(drain)
                if self.close_callback:
                    self.close_callback(SimpleNamespace(reason="flow_end"))

        class FakeJobContext:
            def __init__(self):
                self.delete_room_calls = 0
                self.shutdown_callbacks = []
                self.shutdown_reasons = []

            def add_shutdown_callback(self, callback):
                self.shutdown_callbacks.append(callback)

            def delete_room(self):
                self.delete_room_calls += 1
                future = asyncio.get_running_loop().create_future()
                future.set_result(None)
                return future

            def shutdown(self, reason=""):
                self.shutdown_reasons.append(reason)

        config = {
            "use_rag": False,
            "agent_id": "root-agent",
            "flow": {
                "compiled": {
                    "startNodeId": "start",
                    "outgoingByNodeId": {
                        "start": [
                            {
                                "id": "route-end",
                                "target": "end",
                                "data": {"label": "Done", "condition": "Customer is finished"},
                            }
                        ]
                    },
                    "nodesById": {
                        "end": {
                            "id": "end",
                            "type": "end",
                            "data": {"label": "End", "transferMessage": "Thanks for calling. Goodbye."},
                        }
                    },
                    "agentsByNodeId": {},
                }
            },
        }
        session = FakeSession()
        job_context = FakeJobContext()
        agent = FlowAssistant("You are helpful.", config, {"agent_id": "root-agent"}, node_id="start")
        agent._get_activity_or_raise = lambda: SimpleNamespace(session=session)

        with patch("main.get_job_context", return_value=job_context):
            result = asyncio.run(
                agent.transfer_to_flow_agent._func(agent, "route-end", "customer done")
            )

        self.assertIsNone(result)
        self.assertEqual(session.messages, [("Thanks for calling. Goodbye.", False)])
        self.assertEqual(session.shutdown_drains, [True])
        self.assertEqual(job_context.shutdown_reasons, ["flow_end"])
        self.assertEqual(len(job_context.shutdown_callbacks), 1)

        asyncio.run(job_context.shutdown_callbacks[0]())

        self.assertEqual(job_context.delete_room_calls, 1)

    def test_build_agent_instructions_appends_flow_routes(self):
        instructions = build_agent_instructions(
            {
                "system_prompt": "Root prompt",
                "flow": {
                    "compiled": {
                        "outgoingByNodeId": {
                            "start": [
                                {
                                    "id": "route-returns",
                                    "data": {
                                        "label": "Returns",
                                        "condition": "Customer asks about returns",
                                    },
                                }
                            ]
                        }
                    }
                },
            },
            node_id="start",
        )

        self.assertIn("Root prompt", instructions)
        self.assertIn("route_id=route-returns", instructions)

    def test_rag_context_is_injected_after_user_turn_when_enabled(self):
        async def fake_get_rag_context(agent_id: str, query: str, top_k: int = 5) -> str:
            self.assertEqual(agent_id, "agent_123")
            self.assertEqual(query, "What is the refund policy?")
            return "[refund-policy]\nRefunds are available within 30 days."

        async def run():
            agent = Assistant(
                "You are helpful.",
                {"use_rag": True, "agent_id": "agent_123"},
                {"agent_id": "agent_123"},
            )
            turn_ctx = llm.ChatContext.empty()
            message = turn_ctx.add_message(
                role="user",
                content="What is the refund policy?",
            )

            with patch("main.get_rag_context", fake_get_rag_context):
                await agent.on_user_turn_completed(turn_ctx, message)

            return turn_ctx.messages()

        messages = asyncio.run(run())
        self.assertEqual(messages[-1].role, "system")
        self.assertIn("Relevant knowledge base context", messages[-1].text_content)
        self.assertIn("Refunds are available within 30 days", messages[-1].text_content)

    def test_rag_context_is_not_injected_when_disabled(self):
        async def fake_get_rag_context(*_args, **_kwargs) -> str:
            raise AssertionError("RAG should not be queried")

        async def run():
            agent = Assistant(
                "You are helpful.",
                {"use_rag": False, "agent_id": "agent_123"},
                {"agent_id": "agent_123"},
            )
            turn_ctx = llm.ChatContext.empty()
            message = turn_ctx.add_message(role="user", content="What is covered?")

            with patch("main.get_rag_context", fake_get_rag_context):
                await agent.on_user_turn_completed(turn_ctx, message)

            return turn_ctx.messages()

        messages = asyncio.run(run())
        self.assertEqual(len(messages), 1)


if __name__ == "__main__":
    unittest.main()
