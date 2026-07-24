import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.langfuse_handler import build_langfuse_metadata, setup_langfuse


class LangfuseHandlerTests(unittest.TestCase):
    def test_missing_credentials_disable_tracing(self):
        self.assertIsNone(setup_langfuse({}, environ={}))
        self.assertIsNone(setup_langfuse({}, environ={"LANGFUSE_PUBLIC_KEY": "pk-lf-test"}))

    def test_metadata_includes_call_session_and_llm_identifiers(self):
        metadata = build_langfuse_metadata(
            room_name="room-123",
            call_context={"call_id": "call-456", "agent_id": "agent-789"},
            config={
                "voice_config": {
                    "llm": {"provider": "bedrock", "model": "us.amazon.nova-micro-v1:0"}
                }
            },
        )

        self.assertEqual(metadata["langfuse.session.id"], "room-123")
        self.assertEqual(metadata["quickvoice.call.id"], "call-456")
        self.assertEqual(metadata["quickvoice.agent.id"], "agent-789")
        self.assertEqual(metadata["quickvoice.llm.provider"], "bedrock")
        self.assertEqual(metadata["quickvoice.llm.model"], "us.amazon.nova-micro-v1:0")


if __name__ == "__main__":
    unittest.main()
