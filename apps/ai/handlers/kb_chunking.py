"""Sentence-aware KB chunks measured with the all-MiniLM-L12-v2 tokenizer."""

import re
from bisect import bisect_left, bisect_right
from functools import lru_cache
from pathlib import Path

from tokenizers import Tokenizer


CHUNK_SIZE = 220
CHUNK_OVERLAP = 32
MAX_INPUT_TOKENS = 256
TOKENIZER_PATH = Path(__file__).resolve().parent.parent / "assets" / "minilm-l12-v2" / "tokenizer.json"

# Keep sentence punctuation and closing quotes/brackets in the preceding chunk.
# Line breaks also provide natural boundaries for headings, lists and table rows.
_BOUNDARY = re.compile(r"""[.!?]["'”’)\]]*(?:\s+|$)|\n+""")


@lru_cache(maxsize=1)
def get_tokenizer() -> Tokenizer:
    """Load the pinned tokenizer locally; ingestion never downloads model files."""
    tokenizer = Tokenizer.from_file(str(TOKENIZER_PATH))
    tokenizer.no_truncation()
    tokenizer.no_padding()
    return tokenizer


def chunk_text(
    text: str,
    size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
    *,
    max_input_tokens: int = MAX_INPUT_TOKENS,
) -> list[str]:
    """Pack sentences into token windows, retaining original text and overlap.

    Size includes overlap but excludes model special tokens. The effective
    size is capped by max_input_tokens minus the tokenizer's special tokens,
    allowing a runtime configured for 128 tokens to use the same splitter.
    Long sentences fall back to token offsets, never decoded/normalized text.
    """
    if not isinstance(size, int) or size <= 0:
        raise ValueError("Chunk size must be a positive token count")
    if not isinstance(max_input_tokens, int) or not 2 < max_input_tokens <= MAX_INPUT_TOKENS:
        raise ValueError("Model input limit must be between 3 and 256 tokens")

    tokenizer = get_tokenizer()
    budget = min(size, max_input_tokens - tokenizer.num_special_tokens_to_add(False))
    if not isinstance(overlap, int) or not 0 <= overlap < budget:
        raise ValueError("Chunk overlap must be nonnegative and smaller than the effective token budget")
    if not text.strip():
        return []

    encoding = tokenizer.encode(text, add_special_tokens=False)
    if not encoding.ids:
        return []
    token_starts = [start for start, _ in encoding.offsets]
    boundaries = sorted({match.end() for match in _BOUNDARY.finditer(text)} | {len(text)})
    chunks: list[str] = []
    start = 0
    previous_end = 0

    while start < len(text):
        first_token = bisect_left(token_starts, start)
        last_token = min(first_token + budget, len(token_starts))
        end = token_starts[last_token] if last_token < len(token_starts) else len(text)

        # Only choose a boundary that adds new content beyond the last chunk.
        boundary_idx = bisect_right(boundaries, end) - 1
        if boundary_idx >= 0 and boundaries[boundary_idx] > previous_end:
            end = boundaries[boundary_idx]

        window = text[start:end]
        window_encoding = tokenizer.encode(window, add_special_tokens=False)
        # Starting inside a WordPiece word can change how the substring encodes.
        # Recount the actual text and shorten it until it fits, without truncation.
        while len(window_encoding.ids) > budget:
            end = start + window_encoding.offsets[budget][0]
            window = text[start:end]
            window_encoding = tokenizer.encode(window, add_special_tokens=False)

        if end <= start:
            # Some Unicode characters (e.g. Hangul) expand to multiple tokens.
            # They cannot be split further while preserving the source text.
            raise ValueError("Chunk token budget is too small for a source character")

        if end <= previous_end:
            # An unusually small custom budget may leave room only for overlap.
            # Drop that overlap so the next iteration always adds new content.
            start = previous_end
            continue

        chunk = window.strip()
        if chunk:
            if len(tokenizer.encode(chunk).ids) > max_input_tokens:
                raise ValueError("Chunk exceeds the configured model input token limit")
            chunks.append(chunk)
        if end == len(text):
            break

        next_start = end
        if overlap and len(window_encoding.ids) > overlap:
            next_start = start + window_encoding.offsets[-overlap][0]
            # Prefer complete trailing sentences when they fit in the overlap.
            boundary_idx = bisect_left(boundaries, next_start)
            if boundary_idx < len(boundaries) and boundaries[boundary_idx] < end:
                next_start = boundaries[boundary_idx]
        previous_end = end
        start = next_start if next_start > start else end

    return chunks
