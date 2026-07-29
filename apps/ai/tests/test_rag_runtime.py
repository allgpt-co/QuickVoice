import asyncio
import os
import sys
import unittest
from unittest.mock import patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from livekit.agents import llm

from main import Assistant


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

    def test_rag_context_is_injected_after_user_turn_when_enabled(self):
        observations = []

        class Observer:
            def record_rag(self, **kwargs):
                observations.append(kwargs)

        async def fake_get_rag_context(agent_id: str, query: str, top_k: int = 5) -> str:
            self.assertEqual(agent_id, "agent_123")
            self.assertEqual(query, "What is the refund policy?")
            return "[refund-policy]\nRefunds are available within 30 days."

        async def run():
            agent = Assistant(
                "You are helpful.",
                {"use_rag": True, "agent_id": "agent_123"},
                {"agent_id": "agent_123"},
                langfuse_observer=Observer(),
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
        self.assertEqual(len(observations), 1)
        self.assertTrue(observations[0]["success"])
        self.assertIn("Refunds are available", observations[0]["context"])

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
