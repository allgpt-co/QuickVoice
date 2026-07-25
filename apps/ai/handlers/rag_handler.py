"""
RAG retrieval: embed a query and fetch the top-k chunks from Pinecone
for the given agent namespace.
"""

import os
import asyncio
import time
from utils.metrics import emit_metric
from utils.logger import logger, redact_sensitive
from utils.pinecone_client import pinecone_client, pinecone_host


class RagRetrievalError(RuntimeError):
    pass


EMBEDDING_MODEL = os.environ.get("PINECONE_EMBEDDING_MODEL", "llama-text-embed-v2")
EMBEDDING_TRUNCATE = os.environ.get("PINECONE_EMBEDDING_TRUNCATE", "END")


def _pinecone():
    return pinecone_client()


def _index():
    pc = _pinecone()
    return pc.Index(host=pinecone_host())


def _pinecone_namespace(agent_id: str) -> str:
    return agent_id


def _agent_filter(agent_id: str) -> dict | None:
    return None


def _embedding_values(response) -> list[list[float]]:
    data = response.get("data", []) if isinstance(response, dict) else getattr(response, "data", [])
    values: list[list[float]] = []
    for item in data:
        vector = item.get("values") if isinstance(item, dict) else getattr(item, "values", None)
        if vector is None:
            raise ValueError("Pinecone embedding response did not include values")
        values.append(list(vector))
    return values


async def embed_query(query: str) -> list[float]:
    pc = _pinecone()
    result = await asyncio.to_thread(
        pc.inference.embed,
        model=EMBEDDING_MODEL,
        inputs=[query],
        parameters={"input_type": "query", "truncate": EMBEDDING_TRUNCATE},
    )
    embeddings = _embedding_values(result)
    if not embeddings:
        raise ValueError("Pinecone embedding response was empty")
    return embeddings[0]


async def get_rag_context(agent_id: str, query: str, top_k: int = 5) -> str:
    """
    Embed `query`, query Pinecone in the agent's namespace, and return
    the concatenated top-k chunk texts ready for injection into a system prompt.
    Returns an empty string when no matches exist. Raises RagRetrievalError
    when the embedding/vector provider fails.
    """
    started = time.perf_counter()
    api_key = os.environ.get("PINECONE_API_KEY", "")
    if not api_key or api_key.startswith("dev-") or "your-pinecone" in os.environ.get("PINECONE_HOST", ""):
        return ""
    try:
        vector = await embed_query(query)
        index = _index()
        resp = await asyncio.to_thread(
            index.query,
            vector=vector,
            top_k=top_k,
            namespace=_pinecone_namespace(agent_id),
            filter=_agent_filter(agent_id),
            include_metadata=True,
        )
        matches = resp.get("matches", [])
        if not matches:
            emit_metric(
                "rag_retrieval",
                status="miss",
                agent_id=agent_id,
                top_k=top_k,
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            logger.info("[rag] miss {}", redact_sensitive({"agent": agent_id, "top_k": top_k}))
            return ""

        parts = []
        for m in matches:
            metadata = m.get("metadata", {})
            text = metadata.get("text", "")
            name = metadata.get("name", "")
            chunk_id = m.get("id") or _chunk_id_from_metadata(metadata)
            score = m.get("score")
            if text:
                citation = f"{name or 'Knowledge base'}"
                if chunk_id:
                    citation += f" chunk={chunk_id}"
                page = metadata.get("page") or metadata.get("pageNumber")
                sheet = metadata.get("sheet") or metadata.get("sheetName")
                if page:
                    citation += f" page={page}"
                if sheet:
                    citation += f" sheet={sheet}"
                if score is not None:
                    citation += f" score={float(score):.2f}"
                parts.append(f"[{citation}]\n{text}")

        emit_metric(
            "rag_retrieval",
            status="hit",
            agent_id=agent_id,
            top_k=top_k,
            matches=len(parts),
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        logger.info("[rag] hit {}", redact_sensitive({"agent": agent_id, "matches": len(parts)}))
        return "\n\n---\n\n".join(parts)

    except Exception as exc:
        emit_metric(
            "rag_retrieval",
            status="error",
            agent_id=agent_id,
            top_k=top_k,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        logger.warning("[rag] retrieval failed {}", redact_sensitive({"agent": agent_id, "error": str(exc)}))
        raise RagRetrievalError("Knowledge base retrieval failed") from exc


def _chunk_id_from_metadata(metadata: dict) -> str:
    kb_id = metadata.get("kbId")
    chunk_idx = metadata.get("chunkIdx")
    if kb_id is None or chunk_idx is None:
        return ""
    return f"{kb_id}#{chunk_idx}"
