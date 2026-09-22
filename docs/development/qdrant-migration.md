# Pinecone to Qdrant migration

QuickVoice keeps Pinecone as the runtime default until both providers are selected explicitly. This prevents a `GOOGLE_API_KEY` or `QDRANT_URL` used by another service from silently changing the embedding space or vector store.

For an existing installation, migrate the vector store and embedding model in separate operations. Existing Pinecone vectors can only be queried with the embedding model that created them.

1. Deploy this release while keeping `VECTOR_STORE_PROVIDER=pinecone` and `EMBEDDING_PROVIDER=pinecone` on the AI service.
2. Deploy Qdrant with persistent storage and create a backup. In Coolify, attach Qdrant and the AI service to the same network and use its stable alias, for example `QDRANT_URL=http://quickvoice-qdrant:6333`.
3. Schedule a maintenance window, then set the AI service to:

   ```env
   VECTOR_STORE_PROVIDER=qdrant
   EMBEDDING_PROVIDER=pinecone
   QDRANT_URL=http://quickvoice-qdrant:6333
   QDRANT_COLLECTION_NAME=quickvoice-kb-pinecone-v1
   ```

4. Redeploy the AI service and run the following command once in the server container:

   ```bash
   pnpm --filter server reindex:knowledge
   ```

   The command atomically claims every active knowledge source and queues it through the normal ingestion worker. Its JSON result reports `discovered`, `queued`, `skipped`, and `failed` counts. A nonzero `failed` count returns a failing exit status.

5. Wait until the queued sources return to `ACTIVE`. Resolve any sources in `ERROR`, then test RAG with known questions for each agent.
6. Keep the Pinecone configuration during verification so rollback only requires restoring `VECTOR_STORE_PROVIDER=pinecone` and redeploying the AI service. Remove the old Pinecone index after the Qdrant results and backups are verified.

To switch from Pinecone embeddings to Google or FastEmbed later, use a new Qdrant collection name, change `EMBEDDING_PROVIDER`, run the same reindex command again, and verify it before deleting the previous collection. Qdrant rejects an existing collection when its vector dimensions do not match the selected embedding model.
