from dotenv import load_dotenv
import os
load_dotenv(".env.dev")

from langfuse import Langfuse, observe

langfuse = Langfuse()

@observe(name="QuickVoice-Integration-Test")
def mock_agent_call():
    print("Mock generation running...")
    return "Hi thi is suhas sagar the Integration successful."

mock_agent_call()
langfuse.flush()
print("Trace successfully sent to Langfuse!")
