# MiniLM knowledge base chunking

Knowledge ingestion uses the bundled `sentence-transformers/all-MiniLM-L12-v2` WordPiece tokenizer to measure chunks. The embedding provider remains independently configured.

```env
KB_CHUNK_SIZE_TOKENS=220
KB_CHUNK_OVERLAP_TOKENS=32
KB_MAX_INPUT_TOKENS=256
```

The chunk size includes overlap and excludes the tokenizer's two special tokens. The effective content budget is the smaller of the chunk size and the input limit minus those special tokens. Overlap must be nonnegative and smaller than that effective budget.

The splitter packs text up to the last sentence or line boundary that fits. For long sentences it falls back to token offsets. It re-tokenizes the actual substring to handle WordPiece boundaries and validates the complete input without truncation. Sentence detection is a punctuation/newline heuristic, so abbreviations can also be boundaries. Original case, Unicode, and internal formatting are retained; whitespace at chunk edges is trimmed. Overlap is approximately 32 tokens, preferring complete trailing sentences when they fit. Every chunk must add new content.

The tokenizer is pinned and shipped in `apps/ai/assets/minilm-l12-v2`; ingestion and tests need no Hugging Face download. All vector storage paths retain the entire chunk text. Token-based chunks can exceed the previous 1,000-character metadata cutoff.

## Match the embedding runtime limit

The upstream [model card](https://huggingface.co/sentence-transformers/all-MiniLM-L12-v2) describes a 256-token default, but the pinned [SentenceTransformers configuration](https://huggingface.co/sentence-transformers/all-MiniLM-L12-v2/blob/a50ef00143b4d5391434df20ae11632588ac25be/sentence_bert_config.json) specifies `max_seq_length: 128`. The tokenizer configuration itself reports 512; that is not the SentenceTransformers runtime limit.

For an embedding runtime explicitly configured for 256 tokens, use the settings above. With SentenceTransformers, set `model.max_seq_length = 256` on the model used to embed documents and queries. For its unmodified 128-token runtime, set `KB_MAX_INPUT_TOKENS=128`; the chunker then limits content to 126 tokens including overlap. Changing the chunking limit does not change the embedding runtime's own limit.

## Existing sources

Only newly processed or reprocessed sources use these chunks. After deployment, run the existing server command `pnpm --filter server reindex:knowledge` to rebuild active sources and verify their ingestion status. Keep the chunk cap (`KB_MAX_CHUNKS_PER_DOCUMENT`, default 500) in mind because changing token budgets changes the number of chunks.

Switching the actual embedding model is a separate configuration/integration change. Both document and query embeddings must use the same model. A model switch requires rebuilding embeddings in a separate compatible collection/index; all-MiniLM-L12-v2 produces 384-dimensional vectors. See [vector migration](qdrant-migration.md).

## Verification

From `apps/ai`, run:

```bash
python -m pytest tests/test_kb_chunking.py tests/test_kb_handler.py tests/test_vector_provider_adapters.py tests/test_rag_handler.py -W error
```
