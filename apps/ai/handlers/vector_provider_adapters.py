"""
Vector Store & Embedding Provider Adapters:
Pluggable adapters for vector database storage and text embeddings.
Supports Pinecone, Qdrant, Google GenAI embeddings, FastEmbed, and OpenAI.
"""

from __future__ import annotations

import abc
import asyncio
import os
import uuid
from dataclasses import dataclass
from typing import Any, Optional

from utils.logger import logger, redact_sensitive


class VectorAdapterError(RuntimeError):
    pass


@dataclass(frozen=True)
class VectorMatch:
    id: str
    score: float
    text: str
    name: str
    metadata: dict[str, Any]


class BaseEmbeddingAdapter(abc.ABC):
    @abc.abstractmethod
    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Batch-embed text chunks for ingestion/storage."""
        pass

    @abc.abstractmethod
    async def embed_query(self, text: str) -> list[float]:
        """Embed a single search query."""
        pass


class BaseVectorStoreAdapter(abc.ABC):
    @abc.abstractmethod
    def upsert(
        self,
        *,
        namespace: str,
        kb_id: str,
        doc_name: str,
        chunks: list[str],
        embeddings: list[list[float]],
    ) -> None:
        """Upsert chunk vectors and metadata for a knowledge document."""
        pass

    @abc.abstractmethod
    def delete_by_kb(self, *, namespace: str, kb_id: str) -> None:
        """Delete all vectors matching a specific kb_id under the given namespace."""
        pass

    @abc.abstractmethod
    async def query(
        self,
        *,
        namespace: str,
        vector: list[float],
        top_k: int = 5,
    ) -> list[VectorMatch]:
        """Query top-k nearest matching chunks in the namespace."""
        pass


# ── Pinecone Embedding Adapter ───────────────────────────────────────────────

class PineconeEmbeddingAdapter(BaseEmbeddingAdapter):
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        truncate: str = "END",
    ):
        from utils.pinecone_client import pinecone_api_key, pinecone_client

        self._api_key = api_key or pinecone_api_key()
        self._model = model or os.environ.get("PINECONE_EMBEDDING_MODEL", "llama-text-embed-v2")
        self._truncate = truncate or os.environ.get("PINECONE_EMBEDDING_TRUNCATE", "END")
        self._client_factory = pinecone_client

    def _client(self):
        return self._client_factory()

    def _embedding_values(self, response) -> list[list[float]]:
        data = response.get("data", []) if isinstance(response, dict) else getattr(response, "data", [])
        values: list[list[float]] = []
        for item in data:
            vector = item.get("values") if isinstance(item, dict) else getattr(item, "values", None)
            if vector is None:
                raise ValueError("Pinecone embedding response did not include values")
            values.append(list(vector))
        return values

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        pc = self._client()
        BATCH = 96
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), BATCH):
            batch = texts[i : i + BATCH]
            result = await asyncio.to_thread(
                pc.inference.embed,
                model=self._model,
                inputs=batch,
                parameters={"input_type": "passage", "truncate": self._truncate},
            )
            all_embeddings.extend(self._embedding_values(result))
        return all_embeddings

    async def embed_query(self, text: str) -> list[float]:
        pc = self._client()
        result = await asyncio.to_thread(
            pc.inference.embed,
            model=self._model,
            inputs=[text],
            parameters={"input_type": "query", "truncate": self._truncate},
        )
        embeddings = self._embedding_values(result)
        if not embeddings:
            raise ValueError("Pinecone embedding response was empty")
        return embeddings[0]


# ── Google GenAI Embedding Adapter ──────────────────────────────────────────
#
# FIX (2026-09): text-embedding-004 and embedding-001 were deprecated by
# Google (Aug 2025 / Jan 2026 respectively) and now 404 on v1beta. The
# current GA model is `gemini-embedding-001`. It defaults to 3072-dim
# output vs. the old model's 768-dim, so we pin `output_dimensionality`
# to keep vectors compatible with any existing Qdrant/Pinecone collection
# that was created for the old model. Change GOOGLE_EMBEDDING_DIMENSIONS
# if you recreate your collection at a different size (768/1536/3072 are
# the officially recommended MRL truncation points).

DEFAULT_GOOGLE_EMBEDDING_MODEL = "gemini-embedding-001"
DEFAULT_GOOGLE_EMBEDDING_DIMENSIONS = 768


class GoogleEmbeddingAdapter(BaseEmbeddingAdapter):
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        output_dimensionality: Optional[int] = None,
    ):
        raw_key = api_key or os.environ.get("GOOGLE_API_KEY")
        if not raw_key or not str(raw_key).strip():
            raise KeyError("GOOGLE_API_KEY")
        self._api_key = str(raw_key).strip().strip("'\"")
        self._model = model or os.environ.get("GOOGLE_EMBEDDING_MODEL", DEFAULT_GOOGLE_EMBEDDING_MODEL)
        self._output_dimensionality = output_dimensionality or int(
            os.environ.get("GOOGLE_EMBEDDING_DIMENSIONS", DEFAULT_GOOGLE_EMBEDDING_DIMENSIONS)
        )
        self._working_model: Optional[str] = None
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from google import genai
                self._client = genai.Client(api_key=self._api_key)
            except ImportError:
                import google.generativeai as gai
                gai.configure(api_key=self._api_key)
                self._client = gai
        return self._client

    def _model_candidates(self) -> list[str]:
        if self._working_model:
            return [self._working_model]
        candidates = [self._model]
        clean = self._model.replace("models/", "")
        with_prefix = f"models/{clean}"
        # Current GA model first; legacy names kept only as last-resort
        # fallbacks in case a given API key/project is still on an older
        # allowlist. These will simply 404 fast and get skipped on modern
        # projects.
        for cand in [
            clean,
            with_prefix,
            "gemini-embedding-001",
            "models/gemini-embedding-001",
            "text-embedding-004",
            "models/text-embedding-004",
            "embedding-001",
            "models/embedding-001",
        ]:
            if cand not in candidates:
                candidates.append(cand)
        return candidates

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        client = self._get_client()
        BATCH = 100
        all_embeddings: list[list[float]] = []

        for i in range(0, len(texts), BATCH):
            batch = texts[i : i + BATCH]
            last_err = None

            for model_name in self._model_candidates():
                try:
                    if hasattr(client, "models") and hasattr(client.models, "embed_content"):
                        resp = await asyncio.to_thread(
                            client.models.embed_content,
                            model=model_name,
                            contents=batch,
                            config={
                                "task_type": "RETRIEVAL_DOCUMENT",
                                "output_dimensionality": self._output_dimensionality,
                            },
                        )
                        embeddings = getattr(resp, "embeddings", [])
                        batch_values = []
                        for emb in embeddings:
                            values = getattr(emb, "values", None) or emb.get("values")
                            batch_values.append(list(values))
                        all_embeddings.extend(batch_values)
                        self._working_model = model_name
                        break
                    else:
                        resp = await asyncio.to_thread(
                            client.embed_content,
                            model=model_name,
                            content=batch,
                            task_type="retrieval_document",
                            output_dimensionality=self._output_dimensionality,
                        )
                        embeddings = resp.get("embedding", [])
                        if isinstance(embeddings, list) and embeddings and isinstance(embeddings[0], list):
                            all_embeddings.extend(embeddings)
                        else:
                            all_embeddings.append(embeddings)
                        self._working_model = model_name
                        break
                except Exception as exc:
                    last_err = exc
                    if "404" in str(exc) or "not found" in str(exc).lower():
                        logger.warning(f"[google-embed] Model '{model_name}' not found for embedContent, trying fallback...")
                        continue
                    raise
            else:
                if last_err:
                    raise last_err

        return all_embeddings

    async def embed_query(self, text: str) -> list[float]:
        client = self._get_client()
        last_err = None

        for model_name in self._model_candidates():
            try:
                if hasattr(client, "models") and hasattr(client.models, "embed_content"):
                    resp = await asyncio.to_thread(
                        client.models.embed_content,
                        model=model_name,
                        contents=[text],
                        config={
                            "task_type": "RETRIEVAL_QUERY",
                            "output_dimensionality": self._output_dimensionality,
                        },
                    )
                    embeddings = getattr(resp, "embeddings", [])
                    if not embeddings:
                        raise ValueError("Google embedding response was empty")
                    values = getattr(embeddings[0], "values", None) or embeddings[0].get("values")
                    self._working_model = model_name
                    return list(values)
                else:
                    resp = await asyncio.to_thread(
                        client.embed_content,
                        model=model_name,
                        content=text,
                        task_type="retrieval_query",
                        output_dimensionality=self._output_dimensionality,
                    )
                    self._working_model = model_name
                    return list(resp.get("embedding", []))
            except Exception as exc:
                last_err = exc
                if "404" in str(exc) or "not found" in str(exc).lower():
                    logger.warning(f"[google-embed] Model '{model_name}' not found for embedContent, trying fallback...")
                    continue
                raise

        if last_err:
            raise last_err
        raise ValueError("Failed to embed query with any Google model")


# ── FastEmbed (Local CPU/GPU) Embedding Adapter ─────────────────────────────

class FastEmbedAdapter(BaseEmbeddingAdapter):
    def __init__(self, model_name: Optional[str] = None):
        self._model_name = model_name or os.environ.get("FASTEMBED_MODEL_NAME", "BAAI/bge-small-en-v1.5")
        self._model = None

    def _get_model(self):
        if self._model is None:
            from fastembed import TextEmbedding
            self._model = TextEmbedding(model_name=self._model_name)
        return self._model

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        model = self._get_model()
        generator = await asyncio.to_thread(lambda: list(model.embed(texts)))
        return [list(vec) for vec in generator]

    async def embed_query(self, text: str) -> list[float]:
        model = self._get_model()
        generator = await asyncio.to_thread(lambda: list(model.query_embed(text)))
        return list(generator[0])


# ── Pinecone Vector Store Adapter ───────────────────────────────────────────

class PineconeVectorStoreAdapter(BaseVectorStoreAdapter):
    def __init__(self):
        from utils.pinecone_client import pinecone_client, pinecone_host
        self._client_factory = pinecone_client
        self._host_factory = pinecone_host

    def _index(self):
        pc = self._client_factory()
        return pc.Index(host=self._host_factory())

    def upsert(
        self,
        *,
        namespace: str,
        kb_id: str,
        doc_name: str,
        chunks: list[str],
        embeddings: list[list[float]],
    ) -> None:
        index = self._index()
        self.delete_by_kb(namespace=namespace, kb_id=kb_id)
        vectors = [
            {
                "id": f"{kb_id}#{i}",
                "values": emb,
                "metadata": {
                    "agentId": namespace,
                    "kbId": kb_id,
                    "name": doc_name,
                    "chunkIdx": i,
                    "text": chunk,
                },
            }
            for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
        ]
        batch_size = 100
        for start in range(0, len(vectors), batch_size):
            index.upsert(vectors=vectors[start : start + batch_size], namespace=namespace)

    def delete_by_kb(self, *, namespace: str, kb_id: str) -> None:
        try:
            index = self._index()
            index.delete(filter={"kbId": {"$eq": kb_id}}, namespace=namespace)
        except Exception as exc:
            msg = str(exc).lower()
            if "namespace not found" in msg or "404" in msg:
                logger.info("[kb] pinecone namespace missing during delete; skipping {}", redact_sensitive({"namespace": namespace, "kbId": kb_id}))
                return
            raise

    async def query(
        self,
        *,
        namespace: str,
        vector: list[float],
        top_k: int = 5,
    ) -> list[VectorMatch]:
        index = self._index()
        resp = await asyncio.to_thread(
            index.query,
            vector=vector,
            top_k=top_k,
            namespace=namespace,
            include_metadata=True,
        )
        matches = resp.get("matches", []) if isinstance(resp, dict) else getattr(resp, "matches", [])
        results: list[VectorMatch] = []
        for m in matches:
            meta = m.get("metadata", {}) if isinstance(m, dict) else getattr(m, "metadata", {})
            results.append(
                VectorMatch(
                    id=m.get("id", "") if isinstance(m, dict) else getattr(m, "id", ""),
                    score=float(m.get("score", 0.0) if isinstance(m, dict) else getattr(m, "score", 0.0)),
                    text=meta.get("text", ""),
                    name=meta.get("name", ""),
                    metadata=dict(meta),
                )
            )
        return results


# ── Qdrant Vector Store Adapter ─────────────────────────────────────────────

class QdrantVectorStoreAdapter(BaseVectorStoreAdapter):
    def __init__(
        self,
        url: Optional[str] = None,
        api_key: Optional[str] = None,
        collection_name: Optional[str] = None,
    ):
        raw_url = url or os.environ.get("QDRANT_URL", "http://localhost:6333")
        self._url = str(raw_url).strip().strip("'\"")
        self._api_key = api_key or os.environ.get("QDRANT_API_KEY")
        self._collection_name = collection_name or os.environ.get("QDRANT_COLLECTION_NAME", "quickvoice-kb")
        self._client = None

    def _get_client(self):
        if self._client is None:
            from qdrant_client import QdrantClient
            self._client = QdrantClient(url=self._url, api_key=self._api_key or None)
        return self._client

    def _ensure_collection(self, vector_size: int):
        from qdrant_client import models
        client = self._get_client()
        collections = client.get_collections().collections
        exists = any(col.name == self._collection_name for col in collections)
        if exists:
            collection = client.get_collection(self._collection_name)
            vectors = collection.config.params.vectors
            configured_size = getattr(vectors, "size", None)
            if isinstance(configured_size, int) and configured_size != vector_size:
                raise VectorAdapterError(
                    f"Qdrant collection '{self._collection_name}' expects {configured_size}-dimensional "
                    f"vectors, but the configured embedding provider returned {vector_size}. "
                    "Use a new collection or reindex it with the selected embedding model."
                )
            return

        client.create_collection(
            collection_name=self._collection_name,
            vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE),
        )
        # Create payload indexes for fast filtered searches
        client.create_payload_index(
            collection_name=self._collection_name,
            field_name="agentId",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )
        client.create_payload_index(
            collection_name=self._collection_name,
            field_name="kbId",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )

    def upsert(
        self,
        *,
        namespace: str,
        kb_id: str,
        doc_name: str,
        chunks: list[str],
        embeddings: list[list[float]],
    ) -> None:
        if not embeddings:
            return
        from qdrant_client import models
        client = self._get_client()
        self._ensure_collection(len(embeddings[0]))
        self.delete_by_kb(namespace=namespace, kb_id=kb_id)

        points = [
            models.PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{namespace}#{kb_id}#{i}")),
                vector=emb,
                payload={
                    "agentId": namespace,
                    "kbId": kb_id,
                    "name": doc_name,
                    "chunkIdx": i,
                    "text": chunk,
                },
            )
            for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
        ]
        batch_size = 100
        for start in range(0, len(points), batch_size):
            client.upsert(
                collection_name=self._collection_name,
                points=points[start : start + batch_size],
            )

    def delete_by_kb(self, *, namespace: str, kb_id: str) -> None:
        from qdrant_client import models
        client = self._get_client()
        try:
            client.delete(
                collection_name=self._collection_name,
                points_selector=models.Filter(
                    must=[
                        models.FieldCondition(key="agentId", match=models.MatchValue(value=namespace)),
                        models.FieldCondition(key="kbId", match=models.MatchValue(value=kb_id)),
                    ]
                ),
            )
        except Exception as exc:
            msg = str(exc).lower()
            if "not found" in msg or "doesn't exist" in msg:
                return
            raise

    async def query(
        self,
        *,
        namespace: str,
        vector: list[float],
        top_k: int = 5,
    ) -> list[VectorMatch]:
        from qdrant_client import models
        client = self._get_client()

        def _search():
            try:
                # Use query_points (newer API) or search (compatible)
                if hasattr(client, "query_points"):
                    return client.query_points(
                        collection_name=self._collection_name,
                        query=vector,
                        limit=top_k,
                        query_filter=models.Filter(
                            must=[models.FieldCondition(key="agentId", match=models.MatchValue(value=namespace))]
                        ),
                        with_payload=True,
                    ).points
                else:
                    return client.search(
                        collection_name=self._collection_name,
                        query_vector=vector,
                        limit=top_k,
                        query_filter=models.Filter(
                            must=[models.FieldCondition(key="agentId", match=models.MatchValue(value=namespace))]
                        ),
                        with_payload=True,
                    )
            except Exception as exc:
                msg = str(exc).lower()
                if "not found" in msg or "doesn't exist" in msg:
                    return []
                raise

        points = await asyncio.to_thread(_search)
        results: list[VectorMatch] = []
        for p in points:
            payload = getattr(p, "payload", {}) or {}
            score = float(getattr(p, "score", 0.0))
            point_id = str(getattr(p, "id", ""))
            results.append(
                VectorMatch(
                    id=point_id,
                    score=score,
                    text=payload.get("text", ""),
                    name=payload.get("name", ""),
                    metadata=dict(payload),
                )
            )
        return results


# ── Factory & Registry ───────────────────────────────────────────────────────

@dataclass(frozen=True)
class VectorAdapters:
    embedding: BaseEmbeddingAdapter
    vector_store: BaseVectorStoreAdapter
    summary: dict[str, str]


def build_embedding_adapter(provider: Optional[str] = None) -> BaseEmbeddingAdapter:
    # Preserve the pre-migration behavior unless the operator explicitly opts in.
    # Credentials can be shared by unrelated features and are not a safe signal for
    # changing the embedding space of an existing vector index.
    chosen = (provider or os.environ.get("EMBEDDING_PROVIDER") or "pinecone").strip().lower()

    if chosen == "google":
        return GoogleEmbeddingAdapter()
    if chosen == "pinecone":
        return PineconeEmbeddingAdapter()
    if chosen == "fastembed":
        return FastEmbedAdapter()

    raise VectorAdapterError(f"Unsupported EMBEDDING_PROVIDER: '{chosen}'")


def build_vector_store_adapter(provider: Optional[str] = None) -> BaseVectorStoreAdapter:
    # QDRANT_URL alone must not move existing Pinecone-backed documents. Switching
    # stores is an explicit deployment step performed after the reindex command.
    chosen = (provider or os.environ.get("VECTOR_STORE_PROVIDER") or "pinecone").strip().lower()

    if chosen == "qdrant":
        return QdrantVectorStoreAdapter()
    if chosen == "pinecone":
        return PineconeVectorStoreAdapter()

    raise VectorAdapterError(f"Unsupported VECTOR_STORE_PROVIDER: '{chosen}'")


_ADAPTER_ENV_NAMES = (
    "EMBEDDING_PROVIDER",
    "VECTOR_STORE_PROVIDER",
    "GOOGLE_API_KEY",
    "GOOGLE_EMBEDDING_MODEL",
    "GOOGLE_EMBEDDING_DIMENSIONS",
    "FASTEMBED_MODEL_NAME",
    "PINECONE_API_KEY",
    "PINECONE_HOST",
    "PINECONE_EMBEDDING_MODEL",
    "PINECONE_EMBEDDING_TRUNCATE",
    "QDRANT_URL",
    "QDRANT_API_KEY",
    "QDRANT_COLLECTION_NAME",
)
_cached_adapters: tuple[tuple[Optional[str], ...], VectorAdapters] | None = None


def clear_vector_adapter_cache() -> None:
    global _cached_adapters
    _cached_adapters = None


def get_vector_adapters(
    embedding_provider: Optional[str] = None,
    vector_store_provider: Optional[str] = None,
) -> VectorAdapters:
    global _cached_adapters

    cacheable = embedding_provider is None and vector_store_provider is None
    fingerprint = tuple(os.environ.get(name) for name in _ADAPTER_ENV_NAMES)
    if cacheable and _cached_adapters and _cached_adapters[0] == fingerprint:
        return _cached_adapters[1]

    emb = build_embedding_adapter(embedding_provider)
    vs = build_vector_store_adapter(vector_store_provider)
    adapters = VectorAdapters(
        embedding=emb,
        vector_store=vs,
        summary={
            "embedding_provider": emb.__class__.__name__,
            "vector_store_provider": vs.__class__.__name__,
        },
    )
    if cacheable:
        _cached_adapters = (fingerprint, adapters)
    return adapters
