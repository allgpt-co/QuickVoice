import sys
from unittest.mock import MagicMock
sys.modules["livekit.local_inference._native"] = MagicMock()

import argparse
from dotenv import load_dotenv
from opentelemetry import trace
from observability.langfuse_tracing import setup_langfuse_tracing


def main():
    parser = argparse.ArgumentParser(description="Verify Langfuse integration independently")
    parser.add_argument("--env-file", type=str, default=".env.dev", help="Path to environment file")
    args = parser.parse_args()

    print(f"Loading env file: {args.env_file}")
    load_dotenv(args.env_file)

    try:
        print("Setting up Langfuse tracing...")
        setup_langfuse_tracing()

        tracer = trace.get_tracer("quickvoice-test-tracer")

        print("Starting manual span 'quickvoice-integration-test'...")
        with tracer.start_as_current_span("quickvoice-integration-test") as span:
            span.set_attribute("test.source", "manual-verification")
            span.set_attribute("test.status", "successful")
            print("Span attributes set. Performing dummy work...")

        print("Flushing spans...")
        provider = trace.get_tracer_provider()
        if hasattr(provider, "force_flush"):
            success = provider.force_flush()
            if success:
                print("Tracer provider force_flush returned success.")
            else:
                print("Warning: Tracer provider force_flush returned failure.")
        else:
            print("Warning: Tracer provider does not support force_flush.")

        print("SUCCESS: Langfuse setup test completed successfully!")

    except Exception as e:
        print(f"FAILURE: Langfuse setup test failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
