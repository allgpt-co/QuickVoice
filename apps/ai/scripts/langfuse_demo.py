#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

APP_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_DIR))

from handlers.langfuse_handler import LangfuseCallObserver


def main() -> int:
    load_dotenv(APP_DIR / ".env.dev")
    load_dotenv(APP_DIR / ".env")

    observer = LangfuseCallObserver()
    config = {
        "agent_id": "langfuse-demo-agent",
        "organization_id": "langfuse-demo-organization",
        "agent_language": "en-US",
        "stt_model": "demo/stt",
        "llm_model": "demo/llm",
        "tts_model": "demo/tts",
        "zero_pii_retention": True,
    }
    observer.start_call(
        room_name="langfuse-demo-room",
        call_context={
            "call_id": "langfuse-demo-call",
            "agent_id": config["agent_id"],
            "direction": "preview",
            "provider": "synthetic",
        },
        config=config,
        preview_mode=True,
    )
    observer.record_configuration(
        success=True,
        duration_seconds=0.01,
        config=config,
    )
    observer.record_session_startup(success=True, duration_seconds=0.02)

    now = datetime.now(timezone.utc)
    observer.record_transcript(
        {"role": "user", "content": "What is the refund policy?", "time": now}
    )
    observer.record_rag(
        agent_id=config["agent_id"],
        query="What is the refund policy?",
        top_k=5,
        context="Refunds are available within 30 days.",
        success=True,
        duration_seconds=0.03,
    )
    observer.record_tool(
        tool_type="http",
        tool_name="lookup_refund_policy",
        arguments={"policy": "standard"},
        result={"status": "found"},
        success=True,
        duration_seconds=0.04,
    )
    observer.record_transcript(
        {
            "role": "assistant",
            "content": "Refunds are available within 30 days.",
            "time": now,
        }
    )
    scores = observer.finish(
        call_completed=True,
        ended_normally=True,
        call_duration_seconds=1.0,
    )
    enabled = observer.enabled
    observer.flush()
    observer.shutdown()

    print(
        json.dumps(
            {
                "langfuse_enabled": enabled,
                "trace_name": "quickvoice.voice_call",
                "scores": scores,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
