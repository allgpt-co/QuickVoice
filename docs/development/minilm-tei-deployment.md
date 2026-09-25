# Self-hosted all-MiniLM-L12-v2 with TEI

QuickVoice can generate knowledge-base embeddings through a private [Text Embeddings Inference](https://github.com/huggingface/text-embeddings-inference) service. Qdrant remains the vector store; TEI only converts document chunks and queries into vectors.

## Pinned runtime

The image in `apps/ai/embeddings/minilm_l12_v2` pins:

- TEI `cpu-1.9.4` by OCI digest.
- `sentence-transformers/all-MiniLM-L12-v2` at revision `a50ef00143b4d5391434df20ae11632588ac25be`.
- Every downloaded model file by SHA-256.
- A derived `sentence_bert_config.json` with `max_seq_length` changed from the pinned upstream value of 128 to 256.

The build fails if a model checksum changes, the upstream sequence limit is no longer 128, or the requested limit exceeds the transformer's 512-position capacity. The final image contains a provenance manifest at:

```text
/models/all-MiniLM-L12-v2/quickvoice-model-manifest.json
```

Build locally with:

```bash
docker build \
  --tag quickvoice-minilm-tei:local \
  --file apps/ai/embeddings/minilm_l12_v2/Dockerfile \
  apps/ai/embeddings/minilm_l12_v2
```

## Private service deployment

Deploy the image beside QuickVoice on a private Docker network with:

- stable alias `minilm-l12-embeddings`;
- container port `80` exposed only to the private network;
- no public FQDN and no host port mapping;
- a generated `API_KEY` secret;
- user `1000:1000`;
- read-only root filesystem;
- writable `tmpfs` at `/tmp`;
- all Linux capabilities dropped;
- `no-new-privileges` enabled;
- initial limits of 2-4 CPU and 2-4 GiB memory, adjusted using measured traffic and reindex load.

Use authenticated `GET /health` for readiness. Before connecting QuickVoice, verify:

1. Unauthenticated `POST /v1/embeddings` returns `401`.
2. Authenticated `GET /info` reports `served_model_name=all-MiniLM-L12-v2` and `max_input_length=256`.
3. Authenticated `POST /v1/embeddings` returns exactly 384 finite values.
4. The service recovers after a container restart with the same runtime identity and behavior.

## QuickVoice configuration

Configure only the AI service:

```env
TEI_URL=http://minilm-l12-embeddings:80
TEI_API_KEY=<same runtime-resolved secret as the TEI API_KEY>
TEI_MODEL_NAME=all-MiniLM-L12-v2
TEI_EMBEDDING_DIMENSIONS=384
TEI_BATCH_SIZE=32
TEI_TIMEOUT_SECONDS=30

KB_CHUNK_SIZE_TOKENS=220
KB_CHUNK_OVERLAP_TOKENS=32
KB_MAX_INPUT_TOKENS=256
```

The TEI adapter:

- batches document chunks;
- restores vectors to input order using response indexes;
- requires one vector per input;
- requires exactly the configured dimensionality;
- rejects nonnumeric and non-finite values;
- fails closed on transport, HTTP, JSON, index, count, or dimension errors;
- never falls back to a different embedding provider.

Do not change `EMBEDDING_PROVIDER` while staging and validating connectivity.

## Qdrant collection

A MiniLM deployment requires a new collection. Do not reuse a collection populated by Pinecone, Google, FastEmbed, or another model.

Recommended collection:

```text
quickvoice-kb-minilm-l12-v1
```

Create it with:

- 384 dimensions;
- cosine distance;
- keyword payload index `agentId`;
- keyword payload index `kbId`;
- a QuickVoice credential scoped read/write to this collection only.

Verify an authenticated insert, query, and delete canary and confirm no canary points remain.

## Cutover

During an approved maintenance window:

1. Verify the running AI image contains the TEI adapter and the token-aware chunking change.
2. Verify AI-to-TEI DNS, authentication, and a 384-dimensional query embedding.
3. Verify AI-to-Qdrant authentication and the 384-dimensional collection.
4. Set:

   ```env
   EMBEDDING_PROVIDER=tei
   VECTOR_STORE_PROVIDER=qdrant
   QDRANT_COLLECTION_NAME=quickvoice-kb-minilm-l12-v1
   ```

5. Redeploy only the AI service.
6. Run:

   ```bash
   pnpm --filter server reindex:knowledge
   ```

7. Wait for every active knowledge source to return to `ACTIVE`; investigate any source in `ERROR`.
8. Verify point counts, known-answer retrieval, cross-agent isolation, and source replacement/deletion by `kbId`.
9. Create an authenticated collection snapshot, copy it off-host, and test a disposable restore.
10. Keep the old collection and provider configuration until the new path has completed its soak period.

A provider switch without a full reindex is invalid because the vector spaces and chunk boundaries differ.
