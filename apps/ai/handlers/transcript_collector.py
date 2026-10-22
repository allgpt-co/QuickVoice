from __future__ import annotations

import re
import time
from collections.abc import Callable
from typing import Any

SYNTHETIC_USER_PREFIX = "user-transcript-"
SYNTHETIC_AGENT_PREFIX = "agent-transcript-"


class TranscriptCollector:
    def __init__(
        self,
        on_item: Callable[[dict[str, Any]], None] | None = None,
        on_user_activity: Callable[[], None] | None = None,
    ) -> None:
        self._items: list[dict[str, Any]] = []
        self._seen_ids: set[str] = set()
        self._unpublished_user_ids: set[str] = set()
        self._next_synthetic_id = 0
        self._recent_agent_transcripts: list[tuple[str, float]] = []
        self._on_item = on_item
        self._on_user_activity = on_user_activity

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
        if not text:
            return
        if self._looks_like_agent_echo(text):
            return
        # A final STT segment is not a final conversation turn. Only publish
        # committed turns; keep segments for speech left uncommitted at hangup.
        # https://docs.livekit.io/reference/agents/events/#conversation_item_added
        message_id = self._synthetic_id(SYNTHETIC_USER_PREFIX)
        self._unpublished_user_ids.add(message_id)
        self._append(
            {
                "id": message_id,
                "role": "user",
                "content": text,
                "time": getattr(event, "created_at", None),
            },
            publish=False,
        )

    def on_agent_transcription_final(self, text: str, time: Any = None) -> None:
        text = str(text or "").strip()
        if not text:
            return
        self._remember_agent_transcript(text)
        if any(
            item["role"] == "agent"
            and _normalize_text(item["content"]) == _normalize_text(text)
            for item in self._items[-3:]
        ):
            return
        self._append(
            {
                "id": self._synthetic_id(SYNTHETIC_AGENT_PREFIX),
                "role": "agent",
                "content": text,
                "time": time,
            }
        )

    def read(self) -> list[dict[str, Any]]:
        return list(self._items)

    def flush(self) -> None:
        """Publish remaining fallback speech once, before closing live monitoring."""
        for item in self._items:
            if item["id"] in self._unpublished_user_ids:
                self._unpublished_user_ids.remove(item["id"])
                self._notify(item)

    def _synthetic_id(self, prefix: str) -> str:
        message_id = f"{prefix}{self._next_synthetic_id}"
        self._next_synthetic_id += 1
        return message_id

    def _append(self, item: dict[str, Any], *, publish: bool = True) -> None:
        if item.get("role") == "agent":
            self._remember_agent_transcript(str(item.get("content") or ""))
        elif self._on_user_activity is not None:
            self._on_user_activity()
        self._items.append(item)
        if publish:
            self._notify(item)

    def _notify(self, item: dict[str, Any]) -> None:
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
        self._recent_agent_transcripts.append((normalized, time.monotonic()))
        del self._recent_agent_transcripts[:-5]

    def _looks_like_agent_echo(self, text: str) -> bool:
        normalized = _normalize_text(text)
        if len(normalized) < 12 or len(normalized.split()) < 3:
            return False
        # ponytail: text matching is only a 3-second STT fallback heuristic;
        # committed conversation turns always win. Audio echo detection belongs in DSP.
        return any(
            time.monotonic() - spoken_at <= 3 and normalized in agent_text
            for agent_text, spoken_at in self._recent_agent_transcripts[-5:]
        )

    def _replace_matching_synthetic_turn(
        self,
        *,
        role: str,
        text: str,
        message_id: str,
        time: Any,
    ) -> bool:
        if role == "user" and self._unpublished_user_ids:
            indices = []
            for index in range(len(self._items) - 1, -1, -1):
                item = self._items[index]
                if item["role"] == "user" and item["id"] not in self._unpublished_user_ids:
                    break  # Never reconcile across an already committed caller turn.
                if item["id"] in self._unpublished_user_ids:
                    indices.append(index)
            indices.reverse()
            combined = " ".join(self._items[index]["content"] for index in indices)
            if indices and _normalize_text(combined) != _normalize_text(text):
                # The current contiguous segments belong to the committed turn,
                # including STT corrections. Older unmatched fallback speech stays.
                start = len(indices) - 1
                while start and indices[start - 1] == indices[start] - 1:
                    start -= 1
                indices = indices[start:]
                combined = " ".join(self._items[index]["content"] for index in indices)
            if indices and (indices[-1] == len(self._items) - 1
                            or _normalize_text(combined) == _normalize_text(text)):
                item = {"id": message_id, "role": role, "content": text, "time": time}
                for index in reversed(indices):
                    self._unpublished_user_ids.discard(self._items[index]["id"])
                    del self._items[index]
                self._items.insert(indices[0], item)
                self._seen_ids.add(message_id)
                self._notify(item)
                return True
        if role == "user":
            return False
        normalized_text = _normalize_text(text)
        for item in reversed(self._items[-5:]):
            if item.get("role") != role:
                continue
            if not str(item.get("id", "")).startswith(SYNTHETIC_AGENT_PREFIX):
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
