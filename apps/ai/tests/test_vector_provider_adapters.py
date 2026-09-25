import asyncio
import json
import math
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

import httpx

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from handlers.vector_provider_adapters import (
    BaseEmbeddingAdapter,
    BaseVectorStoreAdapter,
    FastEmbedAdapter,
    GoogleEmbeddingAdapter,
    PineconeEmbeddingAdapter,
    PineconeVectorStoreAdapter,
    QdrantVectorStoreAdapter,
    TeiEmbeddingAdapter,
    VectorAdapterError,
    VectorMatch,
    build_embedding_adapter,
    build_vector_store_adapter,
    clear_vector_adapter_cache,
    get_vector_adapters,
)


class VectorProviderAdaptersTests(unittest.TestCase):
    def setUp(self):
        self.original_env = os.environ.copy()
        clear_vector_adapter_cache()

    def tearDown(self):
        clear_vector_adapter_cache()
        os.environ.clear()
        os.environ.update(self.original_env)

    def test_factory_resolves_google_and_qdrant_when_configured(self):
        os.environ["EMBEDDING_PROVIDER"] = "google"
        os.environ["VECTOR_STORE_PROVIDER"] = "qdrant"
        os.environ["GOOGLE_API_KEY"] = "AIzaSyTestKey123"
        os.environ["QDRANT_URL"] = "http://localhost:6333"

        adapters = get_vector_adapters()
        self.assertIsInstance(adapters.embedding, GoogleEmbeddingAdapter)
        self.assertIsInstance(adapters.vector_store, QdrantVectorStoreAdapter)
        self.assertEqual(adapters.summary["embedding_provider"], "GoogleEmbeddingAdapter")
        self.assertEqual(adapters.summary["vector_store_provider"], "QdrantVectorStoreAdapter")

    def test_factory_resolves_fastembed_when_configured(self):
        os.environ["EMBEDDING_PROVIDER"] = "fastembed"
        os.environ["VECTOR_STORE_PROVIDER"] = "qdrant"

        adapters = get_vector_adapters()
        self.assertIsInstance(adapters.embedding, FastEmbedAdapter)
        self.assertIsInstance(adapters.vector_store, QdrantVectorStoreAdapter)

    def test_factory_resolves_pinecone_when_configured(self):
        os.environ["EMBEDDING_PROVIDER"] = "pinecone"
        os.environ["VECTOR_STORE_PROVIDER"] = "pinecone"
        os.environ["PINECONE_API_KEY"] = "pcsk_test_key"
        os.environ["PINECONE_HOST"] = "https://test.svc.pinecone.io"

        adapters = get_vector_adapters()
        self.assertIsInstance(adapters.embedding, PineconeEmbeddingAdapter)
        self.assertIsInstance(adapters.vector_store, PineconeVectorStoreAdapter)

    def test_factory_resolves_tei_when_configured(self):
        os.environ["TEI_URL"] = "http://minilm-l12-embeddings:80"
        os.environ["TEI_API_KEY"] = "test-tei-api-key"

        adapter = build_embedding_adapter("tei")

        self.assertEqual(adapter.__class__.__name__, "TeiEmbeddingAdapter")

    def test_factory_does_not_switch_providers_from_unrelated_credentials(self):
        os.environ.pop("EMBEDDING_PROVIDER", None)
        os.environ.pop("VECTOR_STORE_PROVIDER", None)
        os.environ["GOOGLE_API_KEY"] = "AIzaSyTestKey123"
        os.environ["QDRANT_URL"] = "http://localhost:6333"
        os.environ["PINECONE_API_KEY"] = "pcsk_test_key"
        os.environ["PINECONE_HOST"] = "https://test.svc.pinecone.io"

        adapters = get_vector_adapters()

        self.assertIsInstance(adapters.embedding, PineconeEmbeddingAdapter)
        self.assertIsInstance(adapters.vector_store, PineconeVectorStoreAdapter)

    def test_factory_reuses_configured_adapters(self):
        os.environ["EMBEDDING_PROVIDER"] = "google"
        os.environ["VECTOR_STORE_PROVIDER"] = "qdrant"
        os.environ["GOOGLE_API_KEY"] = "AIzaSyTestKey123"
        os.environ["QDRANT_URL"] = "http://localhost:6333"

        first = get_vector_adapters()
        second = get_vector_adapters()

        self.assertIs(first, second)

    def test_factory_refreshes_cached_tei_adapter_when_configuration_changes(self):
        os.environ["EMBEDDING_PROVIDER"] = "tei"
        os.environ["VECTOR_STORE_PROVIDER"] = "qdrant"
        os.environ["TEI_URL"] = "http://minilm-l12-embeddings:80"
        os.environ["TEI_API_KEY"] = "test-tei-api-key"
        os.environ["TEI_MODEL_NAME"] = "all-MiniLM-L12-v2"

        first = get_vector_adapters()
        os.environ["TEI_MODEL_NAME"] = "replacement-model"
        second = get_vector_adapters()

        self.assertIsNot(first, second)

    def test_factory_rejects_unsupported_providers(self):
        with self.assertRaises(VectorAdapterError):
            build_embedding_adapter("invalid_emb")

        with self.assertRaises(VectorAdapterError):
            build_vector_store_adapter("invalid_vs")

    def test_google_embedding_adapter_requires_api_key(self):
        os.environ.pop("GOOGLE_API_KEY", None)
        with self.assertRaises(KeyError):
            GoogleEmbeddingAdapter()

    def test_google_embedding_adapter_embed_documents_and_query(self):
        os.environ["GOOGLE_API_KEY"] = "AIzaSyFakeKey"
        adapter = GoogleEmbeddingAdapter(model="text-embedding-004")

        mock_client = MagicMock()
        mock_embedding_1 = MagicMock()
        mock_embedding_1.values = [0.1, 0.2, 0.3]
        mock_embedding_2 = MagicMock()
        mock_embedding_2.values = [0.4, 0.5, 0.6]

        mock_resp = MagicMock()
        mock_resp.embeddings = [mock_embedding_1, mock_embedding_2]
        mock_client.models.embed_content.return_value = mock_resp

        adapter._client = mock_client

        # Test document batch embedding
        doc_embeddings = asyncio.run(adapter.embed_documents(["first chunk", "second chunk"]))
        self.assertEqual(doc_embeddings, [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
        mock_client.models.embed_content.assert_called_with(
            model="text-embedding-004",
            contents=["first chunk", "second chunk"],
            config={"task_type": "RETRIEVAL_DOCUMENT",
            "output_dimensionality": 768,},
        )

        # Test query embedding
        mock_query_resp = MagicMock()
        mock_query_resp.embeddings = [mock_embedding_1]
        mock_client.models.embed_content.return_value = mock_query_resp

        query_embedding = asyncio.run(adapter.embed_query("search term"))
        self.assertEqual(query_embedding, [0.1, 0.2, 0.3])
        mock_client.models.embed_content.assert_called_with(
            model="text-embedding-004",
            contents=["search term"],
            config={"task_type": "RETRIEVAL_QUERY",
            "output_dimensionality": 768,
            },
        )

    def test_tei_adapter_batches_authenticated_requests_and_preserves_response_order(self):
        requests = []

        def handler(request):
            requests.append(request)
            payload = json.loads(request.content)
            vectors_by_text = {
                "first": [1.0, 0.0, 0.0],
                "second": [0.0, 1.0, 0.0],
                "third": [0.0, 0.0, 1.0],
                "query": [0.5, 0.5, 0.0],
            }
            data = [
                {"index": index, "embedding": vectors_by_text[text]}
                for index, text in reversed(list(enumerate(payload["input"])))
            ]
            return httpx.Response(200, json={"data": data, "model": payload["model"]})

        adapter = TeiEmbeddingAdapter(
            url="http://minilm-l12-embeddings:80",
            api_key="test-tei-api-key",
            model="all-MiniLM-L12-v2",
            expected_dimensions=3,
            batch_size=2,
            transport=httpx.MockTransport(handler),
        )

        documents = asyncio.run(adapter.embed_documents(["first", "second", "third"]))
        query = asyncio.run(adapter.embed_query("query"))

        self.assertEqual(documents, [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
        self.assertEqual(query, [0.5, 0.5, 0.0])
        self.assertEqual([request.url.path for request in requests], ["/v1/embeddings"] * 3)
        self.assertEqual([json.loads(request.content)["input"] for request in requests], [
            ["first", "second"],
            ["third"],
            ["query"],
        ])
        for request in requests:
            self.assertEqual(request.headers["authorization"], "Bearer test-tei-api-key")

    def test_tei_adapter_rejects_malformed_embedding_responses(self):
        cases = (
            (
                "count",
                {"data": [{"index": 0, "embedding": [1.0, 0.0, 0.0]}]},
                ["first", "second"],
                "returned 1 embeddings for 2 inputs",
            ),
            (
                "dimension",
                {"data": [{"index": 0, "embedding": [1.0, 0.0]}]},
                ["first"],
                "expected 3 dimensions",
            ),
            (
                "nonfinite",
                {"data": [{"index": 0, "embedding": [1.0, math.nan, 0.0]}]},
                ["first"],
                "non-finite",
            ),
            (
                "index",
                {"data": [{"index": 1, "embedding": [1.0, 0.0, 0.0]}]},
                ["first"],
                "invalid indexes",
            ),
        )

        for name, response, texts, message in cases:
            with self.subTest(name=name):
                if name == "nonfinite":
                    transport = httpx.MockTransport(
                        lambda request: httpx.Response(
                            200,
                            content=b'{"data":[{"index":0,"embedding":[1.0,NaN,0.0]}]}',
                            headers={"content-type": "application/json"},
                        )
                    )
                else:
                    transport = httpx.MockTransport(
                        lambda request, body=response: httpx.Response(200, json=body)
                    )
                adapter = TeiEmbeddingAdapter(
                    url="http://minilm-l12-embeddings:80",
                    api_key="test-tei-api-key",
                    expected_dimensions=3,
                    transport=transport,
                )
                with self.assertRaisesRegex(VectorAdapterError, message):
                    asyncio.run(adapter.embed_documents(texts))

    def test_tei_adapter_rejects_every_non_success_http_status(self):
        for status_code in (199, 302):
            with self.subTest(status_code=status_code):
                transport = httpx.MockTransport(
                    lambda request, status=status_code: httpx.Response(
                        status,
                        json={"data": [{"index": 0, "embedding": [1.0, 0.0, 0.0]}]},
                    )
                )
                adapter = TeiEmbeddingAdapter(
                    url="http://minilm-l12-embeddings:80",
                    api_key="test-tei-api-key",
                    expected_dimensions=3,
                    transport=transport,
                )
                with self.assertRaisesRegex(
                    VectorAdapterError,
                    f"TEI embedding request failed with HTTP {status_code}",
                ):
                    asyncio.run(adapter.embed_query("query"))

    def test_tei_adapter_requires_private_service_configuration(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(KeyError, "TEI_URL"):
                TeiEmbeddingAdapter()
            with self.assertRaisesRegex(KeyError, "TEI_API_KEY"):
                TeiEmbeddingAdapter(url="http://minilm-l12-embeddings:80")

    def test_tei_adapter_rejects_secret_bearing_base_urls(self):
        for url in (
            "http://user:password@minilm-l12-embeddings:80",
            "http://minilm-l12-embeddings:80?token=secret",
            "http://minilm-l12-embeddings:80#secret",
        ):
            with self.subTest(url=url):
                with self.assertRaisesRegex(VectorAdapterError, "must not contain credentials, query, or fragment"):
                    TeiEmbeddingAdapter(url=url, api_key="test-tei-api-key")

    def test_tei_adapter_ignores_ambient_http_proxy_configuration(self):
        created_clients = []
        real_async_client = httpx.AsyncClient

        def create_client(**kwargs):
            created_clients.append(kwargs)
            return real_async_client(**kwargs)

        transport = httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                json={"data": [{"index": 0, "embedding": [1.0, 0.0, 0.0]}]},
            )
        )
        with patch("handlers.vector_provider_adapters.httpx.AsyncClient", side_effect=create_client):
            adapter = TeiEmbeddingAdapter(
                url="http://minilm-l12-embeddings:80",
                api_key="test-tei-api-key",
                expected_dimensions=3,
                transport=transport,
            )
            asyncio.run(adapter.embed_query("query"))

        self.assertEqual(len(created_clients), 1)
        self.assertIs(created_clients[0]["trust_env"], False)

    def test_tei_adapter_rejects_nonpositive_runtime_limits(self):
        cases = (
            ({"timeout_seconds": 0}, "TEI_TIMEOUT_SECONDS"),
            ({"timeout_seconds": math.nan}, "TEI_TIMEOUT_SECONDS"),
            ({"timeout_seconds": math.inf}, "TEI_TIMEOUT_SECONDS"),
            ({"expected_dimensions": 0}, "TEI_EMBEDDING_DIMENSIONS"),
            ({"batch_size": 0}, "TEI_BATCH_SIZE"),
        )
        for overrides, message in cases:
            with self.subTest(overrides=overrides):
                with self.assertRaisesRegex(VectorAdapterError, message):
                    TeiEmbeddingAdapter(
                        url="http://minilm-l12-embeddings:80",
                        api_key="test-tei-api-key",
                        **overrides,
                    )

    def test_pinecone_adapter_preserves_full_chunk_text(self):
        adapter = PineconeVectorStoreAdapter()
        index = MagicMock()
        text = "information " * 150
        with patch.object(adapter, "_index", return_value=index):
            adapter.upsert(
                namespace="agent_abc",
                kb_id="kb_xyz",
                doc_name="Doc",
                chunks=[text],
                embeddings=[[0.1, 0.2]],
            )
        vector = index.upsert.call_args.kwargs["vectors"][0]
        self.assertEqual(vector["metadata"]["text"], text)

    def test_qdrant_adapter_upsert_query_and_delete(self):
        mock_models = MagicMock()
        mock_models.PointStruct = lambda id, vector, payload: MagicMock(id=id, vector=vector, payload=payload)
        mock_models.Filter = lambda **kwargs: MagicMock(**kwargs)
        mock_models.FieldCondition = lambda **kwargs: MagicMock(**kwargs)
        mock_models.MatchValue = lambda **kwargs: MagicMock(**kwargs)
        mock_models.VectorParams = lambda **kwargs: MagicMock(**kwargs)
        mock_models.Distance.COSINE = "Cosine"
        mock_models.PayloadSchemaType.KEYWORD = "keyword"

        mock_qdrant_module = MagicMock()
        mock_qdrant_module.models = mock_models

        with patch.dict(sys.modules, {"qdrant_client": mock_qdrant_module, "qdrant_client.models": mock_models}):
            adapter = QdrantVectorStoreAdapter(url="http://localhost:6333", collection_name="test-collection")
            mock_qdrant_client = MagicMock()

            # Mock collection check (already exists)
            mock_col = MagicMock()
            mock_col.name = "test-collection"
            mock_collections_resp = MagicMock()
            mock_collections_resp.collections = [mock_col]
            mock_qdrant_client.get_collections.return_value = mock_collections_resp

            adapter._client = mock_qdrant_client

            # 1. Upsert
            chunks = ["information " * 150, "Chunk 2 text"]
            embeddings = [[0.1, 0.2], [0.3, 0.4]]
            adapter.upsert(
                namespace="agent_abc",
                kb_id="kb_xyz",
                doc_name="Doc 1",
                chunks=chunks,
                embeddings=embeddings,
            )

            self.assertTrue(mock_qdrant_client.upsert.called)
            upsert_kwargs = mock_qdrant_client.upsert.call_args.kwargs
            self.assertEqual(upsert_kwargs["collection_name"], "test-collection")
            self.assertEqual(len(upsert_kwargs["points"]), 2)
            self.assertEqual(upsert_kwargs["points"][0].payload["agentId"], "agent_abc")
            self.assertEqual(upsert_kwargs["points"][0].payload["kbId"], "kb_xyz")
            self.assertEqual(upsert_kwargs["points"][0].payload["text"], chunks[0])

            # 2. Query
            mock_point = MagicMock()
            mock_point.id = "point-123"
            mock_point.score = 0.95
            mock_point.payload = {"text": "Chunk 1 text", "name": "Doc 1", "agentId": "agent_abc"}

            mock_query_resp = MagicMock()
            mock_query_resp.points = [mock_point]
            mock_qdrant_client.query_points.return_value = mock_query_resp

            results = asyncio.run(adapter.query(namespace="agent_abc", vector=[0.1, 0.2], top_k=3))
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0].text, "Chunk 1 text")
            self.assertEqual(results[0].score, 0.95)
            self.assertEqual(results[0].name, "Doc 1")

            # 3. Delete
            adapter.delete_by_kb(namespace="agent_abc", kb_id="kb_xyz")
            self.assertTrue(mock_qdrant_client.delete.called)
            delete_kwargs = mock_qdrant_client.delete.call_args.kwargs
            self.assertEqual(delete_kwargs["collection_name"], "test-collection")

            # Existing collections must match the selected embedding dimension.
            mock_qdrant_client.get_collection.return_value.config.params.vectors.size = 3
            with self.assertRaisesRegex(VectorAdapterError, "expects 3-dimensional"):
                adapter.upsert(
                    namespace="agent_abc",
                    kb_id="kb_xyz",
                    doc_name="Doc 1",
                    chunks=["Chunk 1 text"],
                    embeddings=[[0.1, 0.2]],
                )


if __name__ == "__main__":
    unittest.main()
