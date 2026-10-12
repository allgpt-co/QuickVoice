"""
Langfuse integration for QuickVoice.

Sends a trace to Langfuse for every completed voice call.
Each transcript turn becomes a span inside that trace so you can
see the full conversation in the Langfuse UI and run evals on it.

Required env vars (leave blank to disable tracing silently):
  LANGFUSE_PUBLIC_KEY   - your Langfuse project public key
  LANGFUSE_SECRET_KEY   - your Langfuse project secret key
  LANGFUSE_HOST         - defaults to https://cloud.langfuse.com
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

from utils.logger import logger


def _get_client():
    """Return a Langfuse client if credentials are configured, else None."""
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "").strip()
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "").strip()
    host = os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com").strip()

    if not public_key or not secret_key:
        logger.debug("[LANGFUSE] credentials not set - tracing disabled")
        return None

    try:
        from langfuse import Langfuse  # type: ignore
        return Langfuse(public_key=public_key, secret_key=secret_key, host=host)
    except ImportError:
        logger.warning("[LANGFUSE] package not installed - run: pip install langfuse")
        return None
    except Exception as err:
        logger.warning("[LANGFUSE] failed to initialise client: {}", str(err))
        return None


def _call_duration_seconds(started_at: datetime, ended_at: datetime) -> float:
    return max(0.0, (ended_at - started_at).total_seconds())


def _conversation_balance_score(transcripts: list[dict[str, Any]]) -> float:
    user_turns = sum(1 for t in transcripts if t.get("role") == "user")
    agent_turns = sum(1 for t in transcripts if t.get("role") in ("agent", "assistant"))
    if user_turns + agent_turns == 0:
        return 0.0
    return round(min(user_turns, agent_turns) / max(user_turns, agent_turns, 1), 3)


def send_call_trace(
    *,
    call_id: str,
    agent_id: str | None,
    organization_id: str | None,
    started_at: datetime,
    ended_at: datetime,
    transcripts: list[dict[str, Any]],
    config: dict[str, Any],
    call_context: dict[str, Any],
) -> None:
    """
    Send a complete call trace to Langfuse.

    This is fire-and-forget: errors are logged but never re-raised so
    this function can never break the main call finalisation flow.
    """
    client = _get_client()
    if client is None:
        return

    try:
        duration = _call_duration_seconds(started_at, ended_at)
        balance = _conversation_balance_score(transcripts)

        if hasattr(client, "trace"):
            trace = client.trace(
                id=call_id,
                name="voice-agent-call",
                user_id=organization_id,
                session_id=call_id,
                tags=[
                    "agent:" + (agent_id or "unknown"),
                    "direction:" + str(call_context.get("direction", "inbound")),
                    "provider:" + str(call_context.get("provider") or config.get("provider") or "unknown"),
                ],
                metadata={
                    "agent_id": agent_id,
                    "organization_id": organization_id,
                    "duration_seconds": duration,
                    "llm_model": config.get("llm_model"),
                    "stt_model": config.get("stt_model"),
                    "tts_model": config.get("tts_model"),
                    "language": config.get("agent_language"),
                    "direction": call_context.get("direction", "inbound"),
                },
                input={"system_prompt": str(config.get("system_prompt", ""))[:500]},
                output={"transcript_turns": len(transcripts)},
            )

            for index, turn in enumerate(transcripts):
                role = turn.get("role", "unknown")
                content = turn.get("message") or turn.get("content") or ""
                turn_time = turn.get("timestamp") or turn.get("time")

                trace.span(
                    name="turn-" + str(index + 1) + "-" + str(role),
                    input={"role": role, "message": content},
                    metadata={"turn_index": index, "role": role},
                    start_time=turn_time if isinstance(turn_time, datetime) else started_at,
                )

            trace.score(
                name="conversation_balance",
                value=balance,
                comment="Ratio of user-to-agent turns. 1.0 = perfectly balanced.",
            )
            trace.score(
                name="call_duration_score",
                value=round(min(1.0, duration / 120.0), 3),
                comment="Call duration score up to 2 minutes.",
            )

        else:
            # Langfuse v4 SDK
            from langfuse import observe

            @observe(name="voice-agent-call")
            def _log_turns():
                for index, turn in enumerate(transcripts):
                    role = turn.get("role", "unknown")
                    content = turn.get("message") or turn.get("content") or ""

                    @observe(name="turn-" + str(index + 1) + "-" + str(role))
                    def _log_single_turn(r=role, msg=content):
                        return {"role": r, "message": msg}

                    _log_single_turn()

                current_trace_id = client.get_current_trace_id()
                if hasattr(client, "create_score") and current_trace_id:
                    client.create_score(
                        trace_id=current_trace_id,
                        name="conversation_balance",
                        value=balance,
                        comment="Ratio of user-to-agent turns. 1.0 = perfectly balanced.",
                    )
                    client.create_score(
                        trace_id=current_trace_id,
                        name="call_duration_score",
                        value=round(min(1.0, duration / 120.0), 3),
                        comment="Call duration score up to 2 minutes.",
                    )

            _log_turns()

        client.flush()
        logger.info(
            "[LANGFUSE] trace sent - call_id={} turns={} balance={} duration={}s",
            call_id,
            len(transcripts),
            balance,
            round(duration, 1),
        )

    except Exception as err:
        logger.warning("[LANGFUSE] failed to send trace for call_id={}: {}", call_id, str(err))
