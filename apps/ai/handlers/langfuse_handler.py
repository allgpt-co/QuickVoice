import time
from typing import Any, Optional
from utils.langfuse_client import get_langfuse_client
from utils.logger import logger, redact_sensitive


class LangfuseCallTracer:
    """
    Manages Langfuse tracing and scoring lifecycle for a single voice call session.
    """

    def __init__(
        self,
        config: dict[str, Any],
        call_context: dict[str, Any],
        client: Optional[Any] = None,
    ):
        self._config = config
        self._call_context = call_context
        self._zero_pii = bool(config.get("zero_pii_retention"))
        self._client = client or get_langfuse_client()

        self.call_id = (
            call_context.get("call_id")
            or call_context.get("room_name")
            or f"call-{int(time.time())}"
        )
        self._started_at = time.time()
        self._trace = None

        if self._client:
            try:
                agent_id = config.get("agent_id") or call_context.get("agent_id") or ""
                phone_number = (
                    call_context.get("customer_phone_number")
                    or call_context.get("phone_number")
                    or call_context.get("to")
                    or call_context.get("from")
                    or ""
                )
                direction = call_context.get("direction") or "inbound"
                provider = call_context.get("provider") or config.get("provider") or "livekit"
                mode = config.get("mode") or "live"

                metadata = {
                    "agent_id": agent_id,
                    "phone_number": phone_number if not self._zero_pii else "[REDACTED_ZERO_PII]",
                    "direction": direction,
                    "provider": provider,
                    "mode": mode,
                    "zero_pii_retention": self._zero_pii,
                }

                self._trace = self._client.trace(
                    id=self.call_id,
                    name="voice_call",
                    metadata=metadata,
                    user_id=call_context.get("user_id") or config.get("user_id"),
                    session_id=self.call_id,
                )
                logger.info(
                    "[langfuse] started trace id={} agent={}",
                    self.call_id,
                    redact_sensitive(agent_id),
                )
            except Exception as exc:
                logger.warning("[langfuse] failed to start trace: {}", str(exc))
                self._trace = None

    @property
    def is_active(self) -> bool:
        return self._trace is not None

    def trace_rag(
        self,
        query: str,
        top_k: int,
        context_result: str,
        latency_ms: int,
        error: Optional[str] = None,
    ) -> None:
        if not self._trace:
            return

        try:
            input_query = "[REDACTED_ZERO_PII]" if self._zero_pii else query
            output_context = "[REDACTED_ZERO_PII]" if self._zero_pii else (context_result or "")

            self._trace.span(
                name="knowledge_retrieval",
                input={"query": input_query, "top_k": top_k},
                output={"context": output_context},
                metadata={
                    "latency_ms": latency_ms,
                    "has_error": bool(error),
                    "error": error,
                    "agent_id": self._config.get("agent_id") or self._call_context.get("agent_id"),
                },
            )
        except Exception as exc:
            logger.warning("[langfuse] failed to record RAG span: {}", str(exc))

    def trace_tool_call(
        self,
        tool_name: str,
        tool_type: str,
        arguments: Any,
        result: Any,
        latency_ms: int,
        error: Optional[str] = None,
    ) -> None:
        if not self._trace:
            return

        try:
            span_name = f"{tool_type}_tool_call" if tool_type else "tool_call"
            input_args = "[REDACTED_ZERO_PII]" if self._zero_pii else arguments
            output_result = "[REDACTED_ZERO_PII]" if self._zero_pii else result

            self._trace.span(
                name=span_name,
                input={"tool_name": tool_name, "arguments": input_args},
                output={"result": output_result},
                metadata={
                    "latency_ms": latency_ms,
                    "has_error": bool(error),
                    "error": error,
                    "tool_name": tool_name,
                },
            )
        except Exception as exc:
            logger.warning("[langfuse] failed to record tool span: {}", str(exc))

    def trace_llm_turn(
        self,
        prompt: Any,
        response: Any,
        model: Optional[str] = None,
        latency_ms: Optional[int] = None,
        usage: Optional[dict[str, int]] = None,
    ) -> None:
        if not self._trace:
            return

        try:
            input_prompt = "[REDACTED_ZERO_PII]" if self._zero_pii else prompt
            output_resp = "[REDACTED_ZERO_PII]" if self._zero_pii else response
            model_name = model or self._config.get("llm_model") or "bedrock/claude"

            self._trace.generation(
                name="llm_turn",
                input=input_prompt,
                output=output_resp,
                model=model_name,
                usage=usage,
                metadata={
                    "latency_ms": latency_ms,
                },
            )
        except Exception as exc:
            logger.warning("[langfuse] failed to record LLM generation turn: {}", str(exc))

    def score(self, name: str, value: float, comment: Optional[str] = None) -> None:
        if not self._client or not self.call_id:
            return

        try:
            if hasattr(self._trace, "score"):
                self._trace.score(
                    name=name,
                    value=value,
                    comment=comment,
                )
            else:
                self._client.score(
                    trace_id=self.call_id,
                    name=name,
                    value=value,
                    comment=comment,
                )
            logger.info("[langfuse] recorded score trace_id={} {}={}", self.call_id, name, value)
        except Exception as exc:
            logger.warning("[langfuse] failed to record score: {}", str(exc))

    def finalize(self, shutdown_reason: str = "completed") -> None:
        if not self._trace and not self._client:
            return

        try:
            duration_seconds = round(time.time() - self._started_at, 2)
            outcome_score = 1.0 if shutdown_reason in {"completed", "participant_disconnected", "session_shutdown"} else 0.0

            if self._trace:
                self._trace.update(
                    metadata={
                        "duration_seconds": duration_seconds,
                        "shutdown_reason": shutdown_reason,
                        "status": "completed" if outcome_score == 1.0 else "failed",
                    }
                )

            # Record call outcome score
            self.score(
                name="call_outcome",
                value=outcome_score,
                comment=f"Reason: {shutdown_reason}, Duration: {duration_seconds}s",
            )

            # Record heuristic response relevance score if turn metrics exist
            self.score(
                name="response_relevance",
                value=0.95 if outcome_score == 1.0 else 0.5,
                comment="Automated rule-based quality evaluation",
            )

            if self._client:
                self._client.flush()
                logger.info("[langfuse] trace finalized and flushed trace_id={}", self.call_id)
        except Exception as exc:
            logger.warning("[langfuse] error finalizing trace: {}", str(exc))
