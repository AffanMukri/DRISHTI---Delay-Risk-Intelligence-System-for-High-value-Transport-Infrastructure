-- Ask PRAGATI-X document RAG foundation.
-- Structured portfolio queries continue to use normalized monitoring tables;
-- this table contains only extracted document chunks and vector embeddings.

begin;

create extension if not exists vector with schema extensions;

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  chunk_index integer not null,
  page_number integer,
  content text not null,
  character_count integer not null,
  content_sha256 text not null,
  embedding extensions.vector(768) not null,
  embedding_model text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_chunks_index_nonnegative check (chunk_index >= 0),
  constraint document_chunks_page_positive check (page_number is null or page_number > 0),
  constraint document_chunks_content_not_blank check (btrim(content) <> ''),
  constraint document_chunks_character_count_positive check (character_count > 0),
  constraint document_chunks_embedding_model_not_blank check (btrim(embedding_model) <> ''),
  constraint document_chunks_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (document_id, chunk_index)
);

create index document_chunks_document_idx on public.document_chunks (document_id, chunk_index);
create index document_chunks_project_idx on public.document_chunks (project_id, created_at desc);
create index document_chunks_embedding_hnsw_idx
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

create trigger set_document_chunks_updated_at
  before update on public.document_chunks
  for each row execute function public.set_updated_at();

alter table public.document_chunks enable row level security;
alter table public.document_chunks force row level security;

grant select, insert, update, delete on public.document_chunks to authenticated;

create policy document_chunks_active_user_read
  on public.document_chunks for select to authenticated
  using (public.current_app_role() is not null);

create policy document_chunks_upload_roles_insert
  on public.document_chunks for insert to authenticated
  with check (
    public.can_upload_cuf()
    and created_by = (select auth.uid())
  );

create policy document_chunks_upload_roles_update
  on public.document_chunks for update to authenticated
  using (public.can_upload_cuf())
  with check (public.can_upload_cuf());

create policy document_chunks_admin_delete
  on public.document_chunks for delete to authenticated
  using (public.is_admin());

-- Existing audit logging is append-only. This additional permissive policy
-- allows document ingestion events while retaining actor attribution.
create policy audit_logs_project_document_insert
  on public.audit_logs for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and entity_type = 'project_document'
    and public.can_upload_cuf()
  );

comment on table public.document_chunks is
  'Page-aware PDF chunks and Ollama embeddings used only by Ask PRAGATI-X document retrieval.';
comment on column public.document_chunks.embedding is
  '768-dimensional vector; must match OLLAMA_EMBEDDING_DIMENSIONS and the configured embedding model.';

commit;
