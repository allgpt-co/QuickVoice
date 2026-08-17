from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

SYNTHETIC_USER_PREFIX = "user-transcript-"
SYNTHETIC_AGENT_PREFIX = "agent-transcript-"


class TranscriptCollector:
    def __init__(
        self,
        on_item: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self._items: list[dict[str, Any]] = []
        self._seen_ids: set[str] = set()
        self._last_final_user_transcript: str | None = None
        self._recent_agent_transcripts: list[str] = []
        self._on_item = on_item

    def attach(self, session: Any) -> "TranscriptCollector":
        session.on("conversation_item_added", self.on_conversation_item_added)
        session.on("user_input_transcribed", self.on_user_input_transcribed)
        return self

    def on_conversation_item_added(self, event: Any) -> None:
        item = getattr(event, "item", None)
        role = getattr(item, "role", None)
        if role == "assistant":
            role = "agent"
        if role not in ("user", "agent"):
            return

        content = getattr(item, "text_content", None)
        if callable(content):
            content = content()
        if content is None:
            content = getattr(item, "content", "")
        text = _content_to_text(content)
        if not text:
            return
        if role == "user" and self._looks_like_agent_echo(text):
            return

        message_id = str(getattr(item, "id", "") or f"msg-{len(self._items)}")
        if message_id in self._seen_ids:
            return
        item_time = getattr(item, "created_at", None) or getattr(event, "created_at", None)
        if self._replace_matching_synthetic_turn(
            role=role,
            text=text,
            message_id=message_id,
            time=item_time,
        ):
            return
        self._seen_ids.add(message_id)
        self._append(
            {
                "id": message_id,
                "role": role,
                "content": text,
                "time": item_time,
            }
        )

    def on_user_input_transcribed(self, event: Any) -> None:
        if not bool(getattr(event, "is_final", False)):
            return
        text = str(getattr(event, "transcript", "") or "").strip()
        if not text or text == self._last_final_user_transcript:
            return
        self._last_final_user_transcript = text
        if self._looks_like_agent_echo(text):
            return

        # Most final user turns also arrive through conversation_item_added.
        # Keep this as a fallback for STT events that are not materialized into
        # chat history before shutdown.
        if any(item["role"] == "user" and item["content"] == text for item in self._items[-3:]):
            return
        self._append(
            {
                "id": f"user-transcript-{len(self._items)}",
                "role": "user",
                "content": text,
                "time": getattr(event, "created_at", None),
            }
        )

    def on_agent_transcription_final(self, text: str, time: Any = None) -> None:
        text = str(text or "").strip()
        if not text:
            return
        if any(
            item["role"] == "agent"
            and _normalize_text(item["content"]) == _normalize_text(text)
            for item in self._items[-3:]
        ):
            return
        self._append(
            {
                "id": f"agent-transcript-{len(self._items)}",
                "role": "agent",
                "content": text,
                "time": time,
            }
        )

    def read(self) -> list[dict[str, Any]]:
        return list(self._items)

    def _append(self, item: dict[str, Any]) -> None:
        if item.get("role") == "agent":
            self._remember_agent_transcript(str(item.get("content") or ""))
        self._items.append(item)
        if self._on_item is None:
            return
        try:
            self._on_item(dict(item))
        except Exception:
            # Live monitoring is optional and must never break transcript
            # collection or the voice session.
            return

    def _remember_agent_transcript(self, text: str) -> None:
        normalized = _normalize_text(text)
        if len(normalized) < 12:
            return
        if (
            self._recent_agent_transcripts
            and self._recent_agent_transcripts[-1] == normalized
        ):
            return
        self._recent_agent_transcripts.append(normalized)
        del self._recent_agent_transcripts[:-5]

    def _looks_like_agent_echo(self, text: str) -> bool:
        normalized = _normalize_text(text)
        if len(normalized) < 12 or len(normalized.split()) < 3:
            return False
        return any(
            normalized in agent_text
            for agent_text in self._recent_agent_transcripts[-5:]
        )

    def _replace_matching_synthetic_turn(
        self,
        *,
        role: str,
        text: str,
        message_id: str,
        time: Any,
    ) -> bool:
        prefix = SYNTHETIC_USER_PREFIX if role == "user" else SYNTHETIC_AGENT_PREFIX
        normalized_text = _normalize_text(text)
        for item in reversed(self._items[-5:]):
            if item.get("role") != role:
                continue
            if not str(item.get("id", "")).startswith(prefix):
                continue
            if _normalize_text(item.get("content")) != normalized_text:
                continue
            self._seen_ids.discard(str(item.get("id")))
            item["id"] = message_id
            item["time"] = time
            self._seen_ids.add(message_id)
            return True
        return False


def _content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        return " ".join(str(part).strip() for part in content if isinstance(part, str)).strip()
    return str(content or "").strip()


def _normalize_text(value: Any) -> str:
    return " ".join(re.findall(r"\w+", str(value or "").casefold()))
