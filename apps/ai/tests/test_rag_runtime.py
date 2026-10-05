import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

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

    def test_rag_content_is_not_automatically_injected_into_chat_context(self):
        self.assertNotIn("on_user_turn_completed", Assistant.__dict__)


if __name__ == "__main__":
    unittest.main()
