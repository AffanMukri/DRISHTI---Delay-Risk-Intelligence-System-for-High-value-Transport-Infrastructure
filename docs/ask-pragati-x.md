# Ask PRAGATI-X grounding architecture

Ask PRAGATI-X is a constrained intelligence interface over PRAGATI-X records.
It is not an open-domain chatbot and the language model never selects or writes
database queries.

## Request flow

1. A deterministic intent router maps a question to a supported query family.
2. The service runs parameterized PostgreSQL queries, the existing peer engine,
   document vector retrieval, or an explicit hybrid of those paths.
3. Results are converted into numbered evidence records (`S1`, `S2`, ...).
4. Ollama receives only the question and retrieved evidence.
5. Every factual sentence must cite an evidence ID. Answers containing missing
   or unknown citation IDs are discarded and replaced by a deterministic
   evidence summary.
6. The API returns the answer and the complete evidence objects separately.

Supported structured intents are cost/schedule filtering, current risk
explanation, unresolved intervention summaries, peer comparison, current
attention prioritization, and project overview. Document questions use
page-aware PDF chunks. Unsupported questions return insufficient evidence.

## Numerical guarantees

- Costs, percentages, delay days, risk scores, warnings, interventions, and
  peer metrics come from normalized PostgreSQL records or existing deterministic
  analytics.
- The language model is prohibited from estimating missing values.
- Null values remain unavailable and are not converted to zero.
- “Major delay” is the server-side `ASSISTANT_MAJOR_DELAY_DAYS` threshold.
- Results can be capped by `ASSISTANT_MAX_EVIDENCE_ITEMS`; a limitation is
  included whenever retrieval is truncated.

## Document ingestion and RAG

PDF ingestion is a distinct RBAC-protected operation. PyMuPDF extracts text by
page. Text is split into overlapping, page-preserving chunks and embedded in
batches by the configured Ollama embedding model. PostgreSQL `pgvector` stores
the vectors and performs cosine-distance search. Each retrieved excerpt retains
the project, document, page, checksum, embedding model, and ingestion metadata.

Duplicate PDFs are rejected per project by SHA-256 checksum. Files without
extractable text are rejected rather than silently sent through an unspecified
OCR system. Document content is treated as untrusted input; instructions inside
documents are explicitly ignored by the synthesis prompt.

## Authorization

- All assistant endpoints require a valid Supabase session and active profile.
- All database access runs as PostgreSQL `authenticated` with the caller's user
  ID, so existing RLS remains authoritative.
- Administrator, Monitoring Officer, and Analyst roles may ingest PDFs.
- Assistant questions are read-only.
- Document ingestion writes an append-only `audit_logs` record.

## Failure behavior

When Ollama generation is unavailable, structured queries return a deterministic
evidence summary. Document ingestion fails clearly if embeddings cannot be
created. Document-only questions return insufficient evidence when vector
retrieval is unavailable or no chunk clears the configured relevance threshold.
