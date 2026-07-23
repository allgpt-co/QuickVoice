import os
import sys
import unittest
from unittest.mock import patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from utils.langfuse_integration import LangfuseBridge


class LangfuseIntegrationTests(unittest.TestCase):
    def test_start_trace_is_noop_when_langfuse_is_not_configured(self):
        with patch.dict(os.environ, {}, clear=False):
            bridge = LangfuseBridge()
            trace = bridge.start_trace(
                agent_id="agent-123",
                call_id="call-123",
                user_id="user-123",
            )

            self.assertEqual(trace.name, "quickvoice.voice-session")
            self.assertTrue(trace.is_noop)

    def test_record_evaluation_is_safe_when_trace_is_noop(self):
        with patch.dict(os.environ, {}, clear=False):
            bridge = LangfuseBridge()
            trace = bridge.start_trace(
                agent_id="agent-123",
                call_id="call-123",
                user_id="user-123",
            )

            trace.record_evaluation("tone", "good")
            trace.close()


if __name__ == "__main__":
    unittest.main()
