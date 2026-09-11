import os
from dotenv import load_dotenv
from langfuse import Langfuse

load_dotenv(".env")

print("Initializing Langfuse...")
langfuse = Langfuse(
    secret_key=os.environ.get("LANGFUSE_SECRET_KEY"),
    public_key=os.environ.get("LANGFUSE_PUBLIC_KEY"),
    host=os.environ.get("LANGFUSE_HOST") or "https://cloud.langfuse.com",
    debug=True
)

print("Creating trace...")
trace = langfuse.trace(
    name="QuickVoice-Integration-Test",
    tags=["assignment", "success"],
    input="Hello from QuickVoice test",
    output="Trace recorded successfully."
)

trace.span(
    name="mock-processing-step",
    input="Processing audio...",
    output="Audio processed."
)

print("Flushing to dashboard...")
langfuse.flush()
print("Done! The trace has been sent.")
