import json
import os
import subprocess
import sys
import unittest
from pathlib import Path


APP_DIR = Path(__file__).resolve().parents[1]
SCRIPT = APP_DIR / "scripts" / "langfuse_demo.py"


class LangfuseDemoTests(unittest.TestCase):
    def test_demo_runs_without_external_services_when_disabled(self):
        env = {**os.environ, "LANGFUSE_ENABLED": "false"}

        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            cwd=APP_DIR,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertFalse(output["langfuse_enabled"])
        self.assertEqual(output["scores"]["call_completed"], 1.0)
        self.assertEqual(output["scores"]["conversation_turns"], 2.0)
        self.assertEqual(output["scores"]["tool_success_rate"], 1.0)
        self.assertEqual(output["scores"]["rag_success_rate"], 1.0)


if __name__ == "__main__":
    unittest.main()
