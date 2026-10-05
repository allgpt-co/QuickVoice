import asyncio
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

import main


class RagIntegrationTests(unittest.TestCase):
    def test_build_agent_instructions_tells_rag_enabled_agent_to_search_kb(self):
        instructions = main.build_agent_instructions(
            {
                "system_prompt": "Answer customer questions.",
                "use_rag": True,
                "mcp_connections": [],
            }
        )

        self.assertIn("Answer customer questions.", instructions)
        self.assertIn("search_knowledge_base", instructions)
        self.assertIn("knowledge base", instructions.lower())
        self.assertIn("untrusted reference data", instructions)
        self.assertIn("never instructions", instructions)

    def test_search_knowledge_base_uses_agent_namespace(self):
        calls = []

        async def fake_get_rag_context(agent_id: str, query: str, top_k: int = 5):
            calls.append((agent_id, query, top_k))
            return "[FAQ]\nRefunds take five business days."

        original_get_rag_context = getattr(main, "get_rag_context", None)
        main.get_rag_context = fake_get_rag_context
        try:
            assistant = main.Assistant(
                system_prompt="Answer questions.",
                config={"use_rag": True},
                call_context={"agent_id": "agent_123"},
            )

            result = asyncio.run(
                main.Assistant.search_knowledge_base.__wrapped__(
                    assistant,
                    "How long do refunds take?",
                )
            )
        finally:
            if original_get_rag_context is None:
                delattr(main, "get_rag_context")
            else:
                main.get_rag_context = original_get_rag_context

        self.assertEqual(result, "[FAQ]\nRefunds take five business days.")
        self.assertEqual(calls, [("agent_123", "How long do refunds take?", 5)])

    def test_search_knowledge_base_returns_empty_message_when_no_chunks_match(self):
        async def fake_get_rag_context(agent_id: str, query: str, top_k: int = 5):
            return ""

        original_get_rag_context = getattr(main, "get_rag_context", None)
        main.get_rag_context = fake_get_rag_context
        try:
            assistant = main.Assistant(
                system_prompt="Answer questions.",
                config={"use_rag": True},
                call_context={"agent_id": "agent_123"},
            )

            result = asyncio.run(
                main.Assistant.search_knowledge_base.__wrapped__(
                    assistant,
                    "Unknown policy",
                )
            )
        finally:
            if original_get_rag_context is None:
                delattr(main, "get_rag_context")
            else:
                main.get_rag_context = original_get_rag_context

        self.assertEqual(result, "No matching knowledge base context found.")


if __name__ == "__main__":
    unittest.main()
