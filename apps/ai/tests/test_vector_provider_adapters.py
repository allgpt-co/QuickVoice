import asyncio
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

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
    VectorAdapterError,
    VectorMatch,
    build_embedding_adapter,
    build_vector_store_adapter,
    get_vector_adapters,
)


class VectorProviderAdaptersTests(unittest.TestCase):
    def setUp(self):
        self.original_env = os.environ.copy()

    def tearDown(self):
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
            config={"task_type": "RETRIEVAL_DOCUMENT"},
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
            config={"task_type": "RETRIEVAL_QUERY"},
        )

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
            chunks = ["Chunk 1 text", "Chunk 2 text"]
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


if __name__ == "__main__":
    unittest.main()
