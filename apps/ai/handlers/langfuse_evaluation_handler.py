from __future__ import annotations

import os
from datetime import datetime
from typing import Any

from utils.logger import logger, redact_sensitive

LANGFUSE_REQUIRED_ENV = (
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
    "LANGFUSE_BASE_URL",
)


class LangfuseEvaluationHandler:
    def __init__(self, client: Any):
        self._client = client

    @classmethod
    def from_env(cls) -> "LangfuseEvaluationHandler | None":
        if not _env_bool("LANGFUSE_ENABLED", default=False):
            return None

        missing = [name for name in LANGFUSE_REQUIRED_ENV if not os.getenv(name)]
        if missing:
            raise RuntimeError(f"Missing required Langfuse environment variables: {', '.join(missing)}")

        from langfuse import get_client

        return cls(get_client())

    def publish_call_evaluations(
        self,
        *,
        config: dict[str, Any],
        call_context: dict[str, Any],
        started_at: datetime,
        ended_at: datetime,
        transcripts: list[dict[str, Any]],
        payload: dict[str, Any],
    ) -> None:
        call_id = str(payload.get("callId") or call_context.get("call_id") or "").strip()
        if not call_id:
            raise ValueError("callId is required for Langfuse evaluation")

        trace_id = self._client.create_trace_id(seed=f"quickvoice:{call_id}")
        zero_pii_retention = bool(config.get("zero_pii_retention"))
        user_messages, agent_messages = _split_transcripts(transcripts)
        duration_seconds = max(0, int((ended_at - started_at).total_seconds()))

        input_text = None if zero_pii_retention else "\n".join(user_messages) or None
        output_text = None if zero_pii_retention else "\n".join(agent_messages) or None

        metadata = {
            "callId": call_id,
            "agentId": payload.get("agentId"),
            "organizationId": payload.get("organizationId"),
            "direction": payload.get("direction"),
            "provider": payload.get("provider"),
            "durationSeconds": duration_seconds,
            "userTurns": len(user_messages),
            "agentTurns": len(agent_messages),
            "zeroPiiRetention": zero_pii_retention,
        }
        if not zero_pii_retention:
            metadata["summary"] = ((payload.get("metadata") or {}).get("summary") or "")[:500]

        with self._client.start_as_current_observation(
            trace_context={"trace_id": trace_id},
            name="quickvoice-call-evaluation",
            as_type="evaluator",
            input=input_text,
            output=output_text,
            metadata=metadata,
        ) as observation:
            observation.score_trace(
                name="call_completed",
                value=1 if str(payload.get("status") or "").upper() == "COMPLETED" else 0,
                data_type="BOOLEAN",
            )

            response_rate = _agent_response_rate(user_turns=len(user_messages), agent_turns=len(agent_messages))
            if response_rate is not None:
                observation.score_trace(
                    name="agent_response_rate",
                    value=response_rate,
                    data_type="NUMERIC",
                )

            turn_balance = _turn_balance(user_turns=len(user_messages), agent_turns=len(agent_messages))
            if turn_balance is not None:
                observation.score_trace(
                    name="turn_balance",
                    value=turn_balance,
                    data_type="NUMERIC",
                )

            for configured_score in _configured_scores(payload.get("evaluatedData")):
                observation.score_trace(**configured_score)

        self._client.flush()
        logger.info(
            "[LANGFUSE] published call evaluation {}",
            redact_sensitive({"callId": call_id, "traceId": trace_id}),
        )


def _configured_scores(evaluated_data: Any) -> list[dict[str, Any]]:
    if not isinstance(evaluated_data, list):
        return []

    scores: list[dict[str, Any]] = []
    for item in evaluated_data:
        if not isinstance(item, dict):
            continue
        identifier = str(item.get("identifier") or item.get("name") or "").strip()
        if not identifier:
            continue
        value = item.get("value")
        description = str(item.get("description") or "").strip()
        parsed = _score_value(value)
        if parsed is None:
            continue

        score_payload: dict[str, Any] = {
            "name": f"configured_{identifier}",
            "value": parsed["value"],
            "data_type": parsed["data_type"],
        }
        if description:
            score_payload["comment"] = description
        scores.append(score_payload)
    return scores


def _score_value(value: Any) -> dict[str, Any] | None:
    if isinstance(value, bool):
        return {"value": 1 if value else 0, "data_type": "BOOLEAN"}
    if isinstance(value, (int, float)):
        return {"value": float(value), "data_type": "NUMERIC"}
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "yes", "y", "pass", "passed"}:
            return {"value": 1, "data_type": "BOOLEAN"}
        if normalized in {"false", "no", "n", "fail", "failed"}:
            return {"value": 0, "data_type": "BOOLEAN"}
        if normalized:
            return {"value": value.strip(), "data_type": "CATEGORICAL"}
    return None


def _split_transcripts(transcripts: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    user_messages: list[str] = []
    agent_messages: list[str] = []
    for item in transcripts:
        role = str(item.get("role") or "").strip().lower()
        if role == "assistant":
            role = "agent"
        if role not in {"user", "agent"}:
            continue

        message = item.get("message", item.get("content", ""))
        if isinstance(message, list):
            message = " ".join(str(part) for part in message)
        message = str(message or "").strip()
        if not message:
            continue
        if role == "user":
            user_messages.append(message)
        else:
            agent_messages.append(message)
    return user_messages, agent_messages


def _agent_response_rate(*, user_turns: int, agent_turns: int) -> float | None:
    if user_turns <= 0:
        return None
    return round(min(agent_turns / user_turns, 1.0), 4)


def _turn_balance(*, user_turns: int, agent_turns: int) -> float | None:
    total_turns = user_turns + agent_turns
    if total_turns <= 0:
        return None
    return round(min(user_turns, agent_turns) / max(user_turns, agent_turns), 4) if max(user_turns, agent_turns) else None


def _env_bool(name: str, *, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}
