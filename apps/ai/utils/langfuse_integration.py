import os
from dataclasses import dataclass, field
from typing import Any


@dataclass
class LangfuseTrace:
    name: str
    user_id: str | None = None
    session_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    is_noop: bool = True
    _client: Any | None = None
    _trace: Any | None = None

    def record_event(self, name: str, **payload: Any) -> None:
        if self.is_noop or self._trace is None:
            return
        try:
            if hasattr(self._trace, "event"):
                self._trace.event(name=name, **payload)
            elif hasattr(self._trace, "log"):
                self._trace.log(name=name, **payload)
        except Exception:
            return

    def record_evaluation(self, identifier: str, value: str) -> None:
        if self.is_noop or self._trace is None:
            return
        try:
            if hasattr(self._trace, "score"):
                self._trace.score(name=identifier, value=value)
            else:
                self.record_event("evaluation", identifier=identifier, value=value)
        except Exception:
            return

    def close(self) -> None:
        if self.is_noop or self._client is None:
            return
        try:
            if hasattr(self._client, "flush"):
                self._client.flush()
        except Exception:
            return


class LangfuseBridge:
    def __init__(self) -> None:
        self.enabled = bool(os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"))

    def start_trace(self, *, agent_id: str, call_id: str, user_id: str | None = None) -> LangfuseTrace:
        if not self.enabled:
            return LangfuseTrace(
                name="quickvoice.voice-session",
                user_id=user_id,
                session_id=call_id,
                metadata={"agent_id": agent_id, "call_id": call_id},
                is_noop=True,
            )

        try:
            from langfuse import Langfuse
        except Exception:
            return LangfuseTrace(
                name="quickvoice.voice-session",
                user_id=user_id,
                session_id=call_id,
                metadata={"agent_id": agent_id, "call_id": call_id},
                is_noop=True,
            )

        client = Langfuse(
            public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
            secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
            host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
        )
        trace = client.trace(
            name="quickvoice.voice-session",
            user_id=user_id,
            session_id=call_id,
            metadata={"agent_id": agent_id, "call_id": call_id},
        )
        return LangfuseTrace(
            name="quickvoice.voice-session",
            user_id=user_id,
            session_id=call_id,
            metadata={"agent_id": agent_id, "call_id": call_id},
            is_noop=False,
            _client=client,
            _trace=trace,
        )
