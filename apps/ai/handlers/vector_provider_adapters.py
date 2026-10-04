"""
Vector Store & Embedding Provider Adapters:
Pluggable adapters for vector database storage and text embeddings.
Supports Pinecone, Qdrant, Google GenAI embeddings, FastEmbed, and OpenAI.
"""

from __future__ import annotations

import abc
import asyncio
import math
import os
import threading
import uuid
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from utils.logger import logger, redact_sensitive
from utils import kb_index_state


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
    def delete_by_kb(self, *, namespace: str, kb_id: str, permanent: bool = True) -> None:
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


# ── Text Embeddings Inference (TEI) Adapter ─────────────────────────────────

class TeiEmbeddingAdapter(BaseEmbeddingAdapter):
    def __init__(
        self,
        url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        expected_dimensions: Optional[int] = None,
        batch_size: Optional[int] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ):
        raw_url = url or os.environ.get("TEI_URL")
        if not raw_url or not str(raw_url).strip():
            raise KeyError("TEI_URL")
        raw_key = api_key or os.environ.get("TEI_API_KEY")
        if not raw_key or not str(raw_key).strip():
            raise KeyError("TEI_API_KEY")

        self._url = str(raw_url).strip().strip("'\"").rstrip("/")
        self._api_key = str(raw_key).strip().strip("'\"")
        self._model = model or os.environ.get("TEI_MODEL_NAME", "all-MiniLM-L12-v2")
        self._timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else float(os.environ.get("TEI_TIMEOUT_SECONDS", "30"))
        )
        self._expected_dimensions = (
            expected_dimensions
            if expected_dimensions is not None
            else int(os.environ.get("TEI_EMBEDDING_DIMENSIONS", "384"))
        )
        self._batch_size = (
            batch_size
            if batch_size is not None
            else int(os.environ.get("TEI_BATCH_SIZE", "32"))
        )
        self._transport = transport

        parsed_url = httpx.URL(self._url)
        if parsed_url.scheme not in {"http", "https"} or not parsed_url.host:
            raise VectorAdapterError("TEI_URL must be an absolute http(s) URL")
        if parsed_url.username or parsed_url.password or parsed_url.query or parsed_url.fragment:
            raise VectorAdapterError("TEI_URL must not contain credentials, query, or fragment")
        if not math.isfinite(self._timeout_seconds) or self._timeout_seconds <= 0:
            raise VectorAdapterError("TEI_TIMEOUT_SECONDS must be greater than zero")
        if self._expected_dimensions <= 0:
            raise VectorAdapterError("TEI_EMBEDDING_DIMENSIONS must be greater than zero")
        if self._batch_size <= 0:
            raise VectorAdapterError("TEI_BATCH_SIZE must be greater than zero")

    def _validate_response(self, payload: Any, input_count: int) -> list[list[float]]:
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            raise VectorAdapterError("TEI embedding response did not contain a data list")
        if len(data) != input_count:
            raise VectorAdapterError(
                f"TEI returned {len(data)} embeddings for {input_count} inputs"
            )

        by_index: dict[int, list[float]] = {}
        for item in data:
            if not isinstance(item, dict):
                raise VectorAdapterError("TEI embedding response contained an invalid item")
            index = item.get("index")
            if isinstance(index, bool) or not isinstance(index, int) or index in by_index:
                raise VectorAdapterError("TEI embedding response contained invalid indexes")
            raw_embedding = item.get("embedding")
            if not isinstance(raw_embedding, list):
                raise VectorAdapterError("TEI embedding response did not contain a vector")
            if len(raw_embedding) != self._expected_dimensions:
                raise VectorAdapterError(
                    "TEI embedding response expected "
                    f"{self._expected_dimensions} dimensions but received {len(raw_embedding)}"
                )

            embedding: list[float] = []
            for value in raw_embedding:
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    raise VectorAdapterError("TEI embedding response contained a non-numeric value")
                numeric_value = float(value)
                if not math.isfinite(numeric_value):
                    raise VectorAdapterError("TEI embedding response contained a non-finite value")
                embedding.append(numeric_value)
            by_index[index] = embedding

        if set(by_index) != set(range(input_count)):
            raise VectorAdapterError("TEI embedding response contained invalid indexes")
        return [by_index[index] for index in range(input_count)]

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        results: list[list[float]] = []
        headers = {"Authorization": f"Bearer {self._api_key}"}
        try:
            async with httpx.AsyncClient(
                timeout=self._timeout_seconds,
                transport=self._transport,
                trust_env=False,
            ) as client:
                for start in range(0, len(texts), self._batch_size):
                    batch = texts[start : start + self._batch_size]
                    response = await client.post(
                        f"{self._url}/v1/embeddings",
                        headers=headers,
                        json={"input": batch, "model": self._model},
                    )
                    if not 200 <= response.status_code < 300:
                        raise VectorAdapterError(
                            f"TEI embedding request failed with HTTP {response.status_code}"
                        )
                    try:
                        payload = response.json()
                    except ValueError as exc:
                        raise VectorAdapterError("TEI embedding response was not valid JSON") from exc
                    results.extend(self._validate_response(payload, len(batch)))
        except VectorAdapterError:
            raise
        except httpx.RequestError as exc:
            raise VectorAdapterError("TEI embedding request failed") from exc
        return results

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._embed(texts)

    async def embed_query(self, text: str) -> list[float]:
        embeddings = await self._embed([text])
        return embeddings[0]


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
        if not embeddings:
            return
        expected = kb_index_state.assert_not_deleted(namespace, kb_id)
        version = uuid.uuid4().hex
        vectors = [
            {
                "id": f"{kb_id}#{version}#{i}",
                "values": emb,
                "metadata": {
                    "agentId": namespace,
                    "kbId": kb_id,
                    "indexVersion": version,
                    "name": doc_name,
                    "chunkIdx": i,
                    "text": chunk,
                },
            }
            for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
        ]
        version_filter = {"kbId": {"$eq": kb_id}, "indexVersion": {"$eq": version}}
        try:
            for start in range(0, len(vectors), 100):
                index.upsert(vectors=vectors[start : start + 100], namespace=namespace)
        except Exception:
            index.delete(filter=version_filter, namespace=namespace)
            raise
        # Leave staged data intact on an ambiguous Redis publication failure.
        accepted, previous = kb_index_state.publish(namespace, kb_id, version, expected)
        if not accepted:
            index.delete(filter=version_filter, namespace=namespace)
            raise VectorAdapterError("Knowledge source was deleted or changed during indexing")
        if previous.startswith("!"):
            return
        index.delete(filter={"kbId": {"$eq": kb_id}, "indexVersion":
                     {"$eq": previous} if previous else {"$exists": False}}, namespace=namespace)

    def delete_by_kb(self, *, namespace: str, kb_id: str, permanent: bool = True) -> None:
        previous = kb_index_state.delete(namespace, kb_id, permanent=permanent)
        if not permanent and previous.startswith("!"):
            return
        removal_filter = {"kbId": {"$eq": kb_id}}
        if not permanent:
            removal_filter["indexVersion"] = {"$eq": previous} if previous else {"$exists": False}
        try:
            index = self._index()
            index.delete(filter=removal_filter, namespace=namespace)
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
        for attempt in range(3):
            state = await asyncio.to_thread(kb_index_state.snapshot, namespace)
            legacy = {"indexVersion": {"$exists": False}}
            if state:
                legacy["kbId"] = {"$nin": list(state)}
            filters = [legacy] + [
                {"kbId": {"$eq": kb_id}, "indexVersion": {"$eq": version}}
                for kb_id, version in state.items() if not version.startswith("!")
            ]
            resp = await asyncio.to_thread(index.query, vector=vector, top_k=top_k,
                                           namespace=namespace, include_metadata=True, filter={"$or": filters})
            if state == await asyncio.to_thread(kb_index_state.snapshot, namespace):
                break
        else:
            raise VectorAdapterError("Knowledge index changed during retrieval; retry the query")
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
        self._collection_vector_size: Optional[int] = None
        self._collection_lock = threading.Lock()

    def _get_client(self):
        if self._client is None:
            from qdrant_client import QdrantClient
            self._client = QdrantClient(url=self._url, api_key=self._api_key or None)
        return self._client

    def _validate_collection_size(self, collection, vector_size: int) -> None:
        vectors = collection.config.params.vectors
        configured_size = getattr(vectors, "size", None)
        if isinstance(configured_size, int) and configured_size != vector_size:
            raise VectorAdapterError(
                f"Qdrant collection '{self._collection_name}' expects {configured_size}-dimensional "
                f"vectors, but the configured embedding provider returned {vector_size}. "
                "Use a new collection or reindex it with the selected embedding model."
            )

    def _collection_is_ready(self, vector_size: int) -> bool:
        if self._collection_vector_size is None:
            return False
        if self._collection_vector_size != vector_size:
            raise VectorAdapterError(
                f"Qdrant collection '{self._collection_name}' expects "
                f"{self._collection_vector_size}-dimensional vectors, but the configured "
                f"embedding provider returned {vector_size}. Use a new collection or reindex "
                "it with the selected embedding model."
            )
        return True

    @staticmethod
    def _is_collection_missing(exc: Exception) -> bool:
        status = getattr(exc, "status", None) or getattr(exc, "status_code", None)
        message = str(exc).lower()
        return status in {404, "404"} or "not found" in message or "doesn't exist" in message

    def _ensure_collection(self, vector_size: int) -> None:
        if self._collection_is_ready(vector_size):
            return

        from qdrant_client import models
        client = self._get_client()
        with self._collection_lock:
            if self._collection_is_ready(vector_size):
                return

            try:
                collection = client.get_collection(self._collection_name)
            except Exception as exc:
                if not self._is_collection_missing(exc):
                    raise
                try:
                    client.create_collection(
                        collection_name=self._collection_name,
                        vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE),
                    )
                except Exception as create_exc:
                    # Another process may have created the collection after our 404.
                    try:
                        collection = client.get_collection(self._collection_name)
                    except Exception:
                        raise create_exc
                    self._validate_collection_size(collection, vector_size)
                else:
                    # Create payload indexes for fast filtered searches.
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
            else:
                self._validate_collection_size(collection, vector_size)

            self._collection_vector_size = vector_size

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
        expected = kb_index_state.assert_not_deleted(namespace, kb_id)
        from qdrant_client import models
        client = self._get_client()
        self._ensure_collection(len(embeddings[0]))
        index_version = uuid.uuid4().hex

        points = [
            models.PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{namespace}#{kb_id}#{index_version}#{i}")),
                vector=emb,
                payload={
                    "agentId": namespace,
                    "kbId": kb_id,
                    "indexVersion": index_version,
                    "active": False,
                    "name": doc_name,
                    "chunkIdx": i,
                    "text": chunk,
                },
            )
            for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
        ]
        batch_size = 100
        version_filter = models.Filter(
            must=[
                models.FieldCondition(key="agentId", match=models.MatchValue(value=namespace)),
                models.FieldCondition(key="kbId", match=models.MatchValue(value=kb_id)),
                models.FieldCondition(key="indexVersion", match=models.MatchValue(value=index_version)),
            ]
        )
        try:
            for start in range(0, len(points), batch_size):
                client.upsert(
                    collection_name=self._collection_name,
                    points=points[start : start + batch_size],
                    wait=True,
                )
        except Exception:
            try:
                client.delete(
                    collection_name=self._collection_name,
                    points_selector=version_filter,
                    wait=True,
                )
            except Exception as cleanup_exc:
                logger.warning(
                    "[kb] failed to clean staged Qdrant vectors {}",
                    redact_sensitive({"namespace": namespace, "kbId": kb_id, "error": str(cleanup_exc)}),
                )
            raise

        # Do not roll back an ambiguous Redis result: publication may have
        # committed. Unpublished staged vectors are never query-visible.
        accepted, previous = kb_index_state.publish(namespace, kb_id, index_version, expected)
        if not accepted:
            client.delete(collection_name=self._collection_name, points_selector=version_filter, wait=True)
            raise VectorAdapterError("Knowledge source was deleted or changed during indexing")
        # Delete exactly what this atomic publication replaced, never another
        # concurrent writer's generation. Legacy vectors predate the manifest.
        if previous.startswith("!"):
            return
        previous_filter = models.Filter(must=[
            models.FieldCondition(key="agentId", match=models.MatchValue(value=namespace)),
            models.FieldCondition(key="kbId", match=models.MatchValue(value=kb_id)),
        ])
        if previous:
            previous_filter.must.append(models.FieldCondition(key="indexVersion", match=models.MatchValue(value=previous)))
        else:
            previous_filter.should = [
                models.FieldCondition(key="active", match=models.MatchValue(value=True)),
                models.IsEmptyCondition(is_empty=models.PayloadField(key="active")),
            ]
        client.delete(collection_name=self._collection_name, points_selector=previous_filter, wait=True)

    def delete_by_kb(self, *, namespace: str, kb_id: str, permanent: bool = True) -> None:
        previous = kb_index_state.delete(namespace, kb_id, permanent=permanent)
        if not permanent and previous.startswith("!"):
            return
        from qdrant_client import models
        client = self._get_client()
        removal_filter = models.Filter(must=[
            models.FieldCondition(key="agentId", match=models.MatchValue(value=namespace)),
            models.FieldCondition(key="kbId", match=models.MatchValue(value=kb_id)),
        ])
        if not permanent:
            if previous:
                removal_filter.must.append(models.FieldCondition(key="indexVersion", match=models.MatchValue(value=previous)))
            else:
                removal_filter.should = [
                    models.FieldCondition(key="active", match=models.MatchValue(value=True)),
                    models.IsEmptyCondition(is_empty=models.PayloadField(key="active")),
                ]
        try:
            client.delete(collection_name=self._collection_name, points_selector=removal_filter, wait=True)
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

        def _search(state):
            legacy = models.Filter(should=[
                models.FieldCondition(key="active", match=models.MatchValue(value=True)),
                models.IsEmptyCondition(is_empty=models.PayloadField(key="active")),
            ])
            if state:
                legacy.must_not = [models.FieldCondition(key="kbId", match=models.MatchAny(any=list(state)))]
            query_filter = models.Filter(
                must=[models.FieldCondition(key="agentId", match=models.MatchValue(value=namespace))],
                should=[legacy] + [models.Filter(must=[
                    models.FieldCondition(key="kbId", match=models.MatchValue(value=kb_id)),
                    models.FieldCondition(key="indexVersion", match=models.MatchValue(value=version)),
                ]) for kb_id, version in state.items() if not version.startswith("!")],
            )
            try:
                # Use query_points (newer API) or search (compatible)
                if hasattr(client, "query_points"):
                    return client.query_points(
                        collection_name=self._collection_name,
                        query=vector,
                        limit=top_k,
                        query_filter=query_filter,
                        with_payload=True,
                    ).points
                else:
                    return client.search(
                        collection_name=self._collection_name,
                        query_vector=vector,
                        limit=top_k,
                        query_filter=query_filter,
                        with_payload=True,
                    )
            except Exception as exc:
                if self._is_collection_missing(exc):
                    raise VectorAdapterError(
                        f"Qdrant collection '{self._collection_name}' was not found. "
                        "Check QDRANT_COLLECTION_NAME and run the knowledge-base reindex."
                    ) from exc
                raise

        for attempt in range(3):
            state = await asyncio.to_thread(kb_index_state.snapshot, namespace)
            points = await asyncio.to_thread(_search, state)
            if state == await asyncio.to_thread(kb_index_state.snapshot, namespace):
                break
        else:
            raise VectorAdapterError("Knowledge index changed during retrieval; retry the query")
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
    if chosen == "tei":
        return TeiEmbeddingAdapter()

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
    "TEI_URL",
    "TEI_API_KEY",
    "TEI_MODEL_NAME",
    "TEI_TIMEOUT_SECONDS",
    "TEI_EMBEDDING_DIMENSIONS",
    "TEI_BATCH_SIZE",
    "PINECONE_API_KEY",
    "PINECONE_HOST",
    "PINECONE_EMBEDDING_MODEL",
    "PINECONE_EMBEDDING_TRUNCATE",
    "QDRANT_URL",
    "QDRANT_API_KEY",
    "QDRANT_COLLECTION_NAME",
)
_cached_adapters: tuple[tuple[Optional[str], ...], VectorAdapters] | None = None
_cached_vector_store: tuple[tuple[Optional[str], ...], BaseVectorStoreAdapter] | None = None


def clear_vector_adapter_cache() -> None:
    global _cached_adapters, _cached_vector_store
    _cached_adapters = None
    _cached_vector_store = None


def get_vector_store_adapter() -> BaseVectorStoreAdapter:
    """Vector-only operations must not require an embedding API key or model."""
    global _cached_vector_store
    fingerprint = tuple(os.environ.get(name) for name in _ADAPTER_ENV_NAMES)
    if _cached_vector_store and _cached_vector_store[0] == fingerprint:
        return _cached_vector_store[1]
    adapter = build_vector_store_adapter()
    _cached_vector_store = (fingerprint, adapter)
    return adapter


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
    vs = (
        get_vector_store_adapter()
        if vector_store_provider is None
        else build_vector_store_adapter(vector_store_provider)
    )
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
