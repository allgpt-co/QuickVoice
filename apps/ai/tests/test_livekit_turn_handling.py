import ast
import os
import unittest


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MAIN_PATH = os.path.join(ROOT, "main.py")


class LiveKitTurnHandlingTests(unittest.TestCase):
    def test_agent_session_turn_handling_does_not_pass_boolean_preemptive_generation(self):
        with open(MAIN_PATH, encoding="utf-8") as source:
            tree = ast.parse(source.read(), filename=MAIN_PATH)

        agent_sessions = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "AgentSession"
        ]

        self.assertGreaterEqual(len(agent_sessions), 1)

        for session_call in agent_sessions:
            turn_handling = next(
                (
                    keyword.value
                    for keyword in session_call.keywords
                    if keyword.arg == "turn_handling"
                ),
                None,
            )
            self.assertIsNotNone(turn_handling)
            self.assertIsInstance(turn_handling, ast.Call)
            self.assertIsInstance(turn_handling.func, ast.Name)
            self.assertEqual(turn_handling.func.id, "TurnHandlingOptions")

            option_names = {
                keyword.arg
                for keyword in turn_handling.keywords
                if keyword.arg is not None
            }
            self.assertIn("turn_detection", option_names)
            self.assertNotIn("preemptive_generation", option_names)


if __name__ == "__main__":
    unittest.main()
