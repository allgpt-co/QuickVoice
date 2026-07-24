import os
from unittest.mock import MagicMock, patch
import pytest

from utils.langfuse_client import get_langfuse_client, get_langfuse_keys
from handlers.langfuse_handler import LangfuseCallTracer


def test_get_langfuse_keys_defaults():
    with patch.dict(os.environ, {}, clear=True):
        pub, sec, host = get_langfuse_keys()
        assert pub is None
        assert sec is None
        assert host == "https://cloud.langfuse.com"


def test_get_langfuse_keys_placeholder_filtering():
    env = {
        "LANGFUSE_PUBLIC_KEY": "pk-lf-xxxxxxxx",
        "LANGFUSE_SECRET_KEY": "sk-lf-xxxxxxxx",
        "LANGFUSE_HOST": "https://cloud.langfuse.com",
    }
    with patch.dict(os.environ, env):
        pub, sec, host = get_langfuse_keys()
        assert pub is None
        assert sec is None


def test_get_langfuse_client_disabled_on_missing_keys():
    with patch.dict(os.environ, {}, clear=True):
        client = get_langfuse_client()
        assert client is None


def test_get_langfuse_client_success():
    env = {
        "LANGFUSE_PUBLIC_KEY": "pk-lf-real-key-1234",
        "LANGFUSE_SECRET_KEY": "sk-lf-real-key-5678",
        "LANGFUSE_HOST": "https://langfuse.example.com",
    }
    with patch.dict(os.environ, env):
        with patch("langfuse.Langfuse") as mock_langfuse:
            mock_instance = MagicMock()
            mock_langfuse.return_value = mock_instance

            client = get_langfuse_client()
            assert client is mock_instance
            mock_langfuse.assert_called_once_with(
                public_key="pk-lf-real-key-1234",
                secret_key="sk-lf-real-key-5678",
                host="https://langfuse.example.com",
            )


def test_langfuse_call_tracer_lifecycle():
    mock_client = MagicMock()
    mock_trace = MagicMock()
    mock_client.trace.return_value = mock_trace

    config = {
        "agent_id": "agent-123",
        "llm_model": "bedrock/claude-3-haiku",
        "zero_pii_retention": False,
    }
    call_context = {
        "call_id": "call-test-999",
        "customer_phone_number": "+1234567890",
        "direction": "inbound",
    }

    tracer = LangfuseCallTracer(config=config, call_context=call_context, client=mock_client)
    assert tracer.is_active is True

    mock_client.trace.assert_called_once_with(
        id="call-test-999",
        name="voice_call",
        metadata={
            "agent_id": "agent-123",
            "phone_number": "+1234567890",
            "direction": "inbound",
            "provider": "livekit",
            "mode": "live",
            "zero_pii_retention": False,
        },
        user_id=None,
        session_id="call-test-999",
    )

    # RAG span
    tracer.trace_rag("What are the working hours?", 5, "Open 9am-5pm", 120)
    mock_trace.span.assert_called_with(
        name="knowledge_retrieval",
        input={"query": "What are the working hours?", "top_k": 5},
        output={"context": "Open 9am-5pm"},
        metadata={
            "latency_ms": 120,
            "has_error": False,
            "error": None,
            "agent_id": "agent-123",
        },
    )

    # Tool call span
    tracer.trace_tool_call("get_order_status", "mcp", {"order_id": "101"}, {"status": "shipped"}, 250)
    mock_trace.span.assert_called_with(
        name="mcp_tool_call",
        input={"tool_name": "get_order_status", "arguments": {"order_id": "101"}},
        output={"result": {"status": "shipped"}},
        metadata={
            "latency_ms": 250,
            "has_error": False,
            "error": None,
            "tool_name": "get_order_status",
        },
    )

    # LLM generation turn
    tracer.trace_llm_turn(prompt="Hello", response="Hi, how can I help you?", latency_ms=300)
    mock_trace.generation.assert_called_with(
        name="llm_turn",
        input="Hello",
        output="Hi, how can I help you?",
        model="bedrock/claude-3-haiku",
        usage=None,
        metadata={"latency_ms": 300},
    )

    # Finalize trace
    tracer.finalize(shutdown_reason="participant_disconnected")
    mock_trace.update.assert_called_once()
    mock_client.flush.assert_called_once()


def test_zero_pii_redaction():
    mock_client = MagicMock()
    mock_trace = MagicMock()
    mock_client.trace.return_value = mock_trace

    config = {
        "agent_id": "agent-private",
        "zero_pii_retention": True,
    }
    call_context = {
        "call_id": "call-private-123",
        "customer_phone_number": "+19998887777",
    }

    tracer = LangfuseCallTracer(config=config, call_context=call_context, client=mock_client)

    # Verify phone number redacted in trace start metadata
    trace_kwargs = mock_client.trace.call_args.kwargs
    assert trace_kwargs["metadata"]["phone_number"] == "[REDACTED_ZERO_PII]"

    # Verify RAG span redacted
    tracer.trace_rag("Secret Query", 3, "Secret Document Content", 50)
    rag_kwargs = mock_trace.span.call_args.kwargs
    assert rag_kwargs["input"]["query"] == "[REDACTED_ZERO_PII]"
    assert rag_kwargs["output"]["context"] == "[REDACTED_ZERO_PII]"

    # Verify tool call span redacted
    tracer.trace_tool_call("verify_ssn", "http", {"ssn": "123-45-6789"}, {"status": "valid"}, 100)
    tool_kwargs = mock_trace.span.call_args.kwargs
    assert tool_kwargs["input"]["arguments"] == "[REDACTED_ZERO_PII]"
    assert tool_kwargs["output"]["result"] == "[REDACTED_ZERO_PII]"

    # Verify LLM turn redacted
    tracer.trace_llm_turn("Sensitive input", "Sensitive response")
    gen_kwargs = mock_trace.generation.call_args.kwargs
    assert gen_kwargs["input"] == "[REDACTED_ZERO_PII]"
    assert gen_kwargs["output"] == "[REDACTED_ZERO_PII]"
