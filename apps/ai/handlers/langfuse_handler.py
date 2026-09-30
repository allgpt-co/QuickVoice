import asyncio
import hashlib
import json
import math
import os
import re
from contextlib import nullcontext
from typing import Any

from utils.logger import logger, redact_sensitive

try:
    from langfuse import get_client, propagate_attributes
except ImportError:  # pragma: no cover - exercised when optional dependency is absent
    get_client = None
    propagate_attributes = None


TRACE_VERSION = "quickvoice-ai-langfuse-v1"
DEFAULT_SCORE_PREFIX = "call_eval."
FALSE_VALUES = {"0", "false", "no", "off"}
TRUE_VALUES = {"1", "true", "yes", "on"}


def is_langfuse_enabled(env: dict[str, str] | None = None) -> bool:
    env = env or os.environ
    explicit = _normalized_env(env.get("LANGFUSE_ENABLED"))
    if explicit in FALSE_VALUES:
        return False

    has_credentials = bool(env.get("LANGFUSE_PUBLIC_KEY") and env.get("LANGFUSE_SECRET_KEY"))
    if explicit in TRUE_VALUES:
        return has_credentials
    return has_credentials


async def publish_call_to_langfuse(
    payload: dict[str, Any],
    *,
    config: dict[str, Any] | None = None,
    call_context: dict[str, Any] | None = None,
    client: Any | None = None,
    env: dict[str, str] | None = None,
) -> dict[str, str] | None:
    env = env or os.environ
    if client is None and not is_langfuse_enabled(env):
        return None

    try:
        return await asyncio.to_thread(
            record_call_to_langfuse,
            payload,
            config=config,
            call_context=call_context,
            client=client,
            env=env,
        )
    except Exception as error:
        logger.warning("[LANGFUSE] call export failed: {}", redact_sensitive(str(error)))
        return None


def record_call_to_langfuse(
    payload: dict[str, Any],
    *,
    config: dict[str, Any] | None = None,
    call_context: dict[str, Any] | None = None,
    client: Any | None = None,
    env: dict[str, str] | None = None,
) -> dict[str, str] | None:
    env = env or os.environ
    client = client or _get_langfuse_client(env)
    if client is None:
        return None

    call_id = str(payload.get("callId") or "").strip()
    if not call_id:
        return None

    trace_id = _create_trace_id(client, call_id)
    capture_transcripts = _should_capture_transcripts(payload, env)
    metadata = _trace_metadata(payload, config or {}, call_context or {}, capture_transcripts)
    input_payload = _trace_input(payload, config or {}, call_context or {})
    output_payload = _trace_output(payload, capture_transcripts)

    with _attribute_context(payload, metadata):
        with client.start_as_current_observation(
            trace_context={"trace_id": trace_id},
            name="quickvoice.call",
            as_type="agent",
            input=input_payload,
            output=output_payload,
            metadata=metadata,
            version=TRACE_VERSION,
        ):
            pass

    for score in _score_payloads(payload, env):
        client.create_score(trace_id=trace_id, **score)

    if _env_bool(env.get("LANGFUSE_FLUSH_ON_FINALIZE"), default=True) and hasattr(client, "flush"):
        client.flush()

    result = {"trace_id": trace_id}
    trace_url = _trace_url(env, trace_id)
    if trace_url:
        result["trace_url"] = trace_url
    return result


def _get_langfuse_client(env: dict[str, str]):
    if get_client is None:
        logger.warning("[LANGFUSE] langfuse package is not installed")
        return None
    if not is_langfuse_enabled(env):
        return None
    return get_client()


def _attribute_context(payload: dict[str, Any], metadata: dict[str, Any]):
    if propagate_attributes is None:
        return nullcontext()

    return propagate_attributes(
        user_id=_optional_string(payload.get("userId")),
        session_id=_optional_string(payload.get("callId")),
        metadata=metadata,
        tags=["quickvoice", "voice-call", "evaluation"],
        trace_name="quickvoice.call",
        environment=os.getenv("LANGFUSE_ENVIRONMENT") or os.getenv("NODE_ENV") or os.getenv("ENVIRONMENT"),
    )


def _create_trace_id(client: Any, call_id: str) -> str:
    create_trace_id = getattr(client, "create_trace_id", None)
    if callable(create_trace_id):
        return create_trace_id(seed=call_id)
    return hashlib.sha256(call_id.encode("utf-8")).hexdigest()[:32]


def _trace_metadata(
    payload: dict[str, Any],
    config: dict[str, Any],
    call_context: dict[str, Any],
    capture_transcripts: bool,
) -> dict[str, Any]:
    return _compact(
        {
            "callId": payload.get("callId"),
            "organizationId": payload.get("organizationId"),
            "agentId": payload.get("agentId"),
            "direction": payload.get("direction"),
            "provider": payload.get("provider"),
            "durationSeconds": payload.get("durationSeconds"),
            "status": payload.get("status"),
            "mode": call_context.get("mode"),
            "roomName": call_context.get("room_name") or call_context.get("roomName"),
            "llmProvider": config.get("llm_provider") or config.get("llmProvider"),
            "llmModel": config.get("llm_model") or config.get("llmModel"),
            "sttModel": config.get("stt_model") or config.get("sttModel"),
            "ttsModel": config.get("tts_model") or config.get("ttsModel"),
            "useRag": config.get("use_rag"),
            "zeroPiiRetention": _zero_pii_retention(payload),
            "langfuseCaptureTranscripts": capture_transcripts,
            "transcriptCount": len(_as_list(payload.get("transcripts"))),
            "evaluationCount": len(_as_list(payload.get("evaluatedData"))),
        }
    )


def _trace_input(
    payload: dict[str, Any],
    config: dict[str, Any],
    call_context: dict[str, Any],
) -> dict[str, Any]:
    return _compact(
        {
            "callId": payload.get("callId"),
            "agentId": payload.get("agentId"),
            "organizationId": payload.get("organizationId"),
            "direction": payload.get("direction"),
            "provider": payload.get("provider"),
            "startedAt": payload.get("startTime"),
            "endedAt": payload.get("endTime"),
            "durationSeconds": payload.get("durationSeconds"),
            "llmModel": config.get("llm_model") or config.get("llmModel"),
            "sttModel": config.get("stt_model") or config.get("sttModel"),
            "ttsModel": config.get("tts_model") or config.get("ttsModel"),
            "agentNumber": call_context.get("agent_number") or call_context.get("agentNumber"),
        }
    )


def _trace_output(payload: dict[str, Any], capture_transcripts: bool) -> dict[str, Any]:
    output: dict[str, Any] = {
        "extractedData": _as_list(payload.get("extractedData")),
        "evaluatedData": _as_list(payload.get("evaluatedData")),
        "transcriptCount": len(_as_list(payload.get("transcripts"))),
    }
    if capture_transcripts:
        output["transcripts"] = _as_list(payload.get("transcripts"))
    return output


def _score_payloads(payload: dict[str, Any], env: dict[str, str]) -> list[dict[str, Any]]:
    prefix = env.get("LANGFUSE_SCORE_PREFIX") or DEFAULT_SCORE_PREFIX
    scores: list[dict[str, Any]] = []
    for item in _as_list(payload.get("evaluatedData")):
        if not isinstance(item, dict):
            continue
        value = _score_value(item.get("value"))
        if value is None:
            continue
        identifier = str(item.get("identifier") or "evaluation").strip() or "evaluation"
        score_value, data_type = value
        scores.append(
            {
                "name": _score_name(f"{prefix}{identifier}"),
                "value": score_value,
                "data_type": data_type,
                "comment": _optional_string(item.get("description")),
            }
        )
    return scores


def _score_value(value: Any) -> tuple[float | str, str] | None:
    if isinstance(value, bool):
        return (1.0 if value else 0.0, "BOOLEAN")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        numeric = float(value)
        if math.isfinite(numeric):
            return (numeric, "NUMERIC")
        return None
    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None
        lowered = normalized.lower()
        if lowered in TRUE_VALUES:
            return (1.0, "BOOLEAN")
        if lowered in FALSE_VALUES:
            return (0.0, "BOOLEAN")
        if len(normalized) > 120:
            return (normalized[:500], "TEXT")
        return (normalized, "CATEGORICAL")
    if value is None:
        return None
    serialized = json.dumps(value, sort_keys=True, default=str)
    if len(serialized) > 120:
        return (serialized[:500], "TEXT")
    return (serialized, "CATEGORICAL")


def _should_capture_transcripts(payload: dict[str, Any], env: dict[str, str]) -> bool:
    if _zero_pii_retention(payload):
        return False
    return _env_bool(env.get("LANGFUSE_CAPTURE_TRANSCRIPTS"), default=False)


def _zero_pii_retention(payload: dict[str, Any]) -> bool:
    metadata = payload.get("metadata")
    return isinstance(metadata, dict) and bool(metadata.get("zeroPiiRetention"))


def _trace_url(env: dict[str, str], trace_id: str) -> str | None:
    project_id = (env.get("LANGFUSE_PROJECT_ID") or "").strip()
    if not project_id:
        return None
    base_url = (env.get("LANGFUSE_BASE_URL") or "https://cloud.langfuse.com").rstrip("/")
    return f"{base_url}/project/{project_id}/traces/{trace_id}"


def _score_name(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9_.:-]+", "_", value.strip())
    return normalized[:200] or "call_eval.evaluation"


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _compact(value: dict[str, Any]) -> dict[str, Any]:
    return {
        key: item
        for key, item in value.items()
        if item is not None and item != ""
    }


def _optional_string(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _env_bool(value: str | None, *, default: bool) -> bool:
    normalized = _normalized_env(value)
    if normalized in TRUE_VALUES:
        return True
    if normalized in FALSE_VALUES:
        return False
    return default


def _normalized_env(value: str | None) -> str:
    return str(value or "").strip().lower()
