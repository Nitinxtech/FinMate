-- Phase 4: insurance policy intelligence.
-- Uploaded PDFs are TEMPORARY private objects; extracted text and facts are the durable records.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('policy-documents', 'policy-documents', false, 8388608, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Objects live at {user_id}/{document_id}.pdf. No UPDATE policy: files are immutable.
create policy "policy_files_select_own"
on storage.objects
for select
to authenticated
using (bucket_id = 'policy-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "policy_files_insert_own"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'policy-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "policy_files_delete_own"
on storage.objects
for delete
to authenticated
using (bucket_id = 'policy-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  source_kind text not null check (source_kind in ('upload', 'url')),
  source_url text check (source_url is null or char_length(source_url) <= 2048),
  original_filename text check (original_filename is null or char_length(original_filename) <= 255),
  byte_size integer not null check (byte_size > 0 and byte_size <= 8388608),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer check (page_count is null or page_count between 1 and 200),
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed')),
  status_detail text check (status_detail is null or char_length(status_detail) <= 500),
  pending_ocr_pages integer[] not null default '{}',
  ocr_total integer not null default 0 check (ocr_total >= 0),
  policy_type text not null default 'other'
    check (policy_type in ('health', 'life', 'motor', 'travel', 'home', 'personal_accident', 'other')),
  type_confidence numeric(4, 3) check (type_confidence is null or (type_confidence >= 0 and type_confidence <= 1)),
  is_insurance_policy boolean not null default true,
  classification jsonb not null default '{}'::jsonb,
  insurer text check (insurer is null or char_length(insurer) <= 200),
  extraction jsonb not null default '{}'::jsonb,
  storage_path text,
  file_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists policy_documents_user_idx on public.policy_documents(user_id, created_at desc);
create index if not exists policy_documents_expiry_idx on public.policy_documents(file_expires_at)
  where storage_path is not null;

create table if not exists public.policy_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.policy_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  text text not null check (char_length(text) <= 60000),
  text_source text not null check (text_source in ('text', 'ocr')),
  unique (document_id, page_number)
);

create index if not exists policy_pages_document_idx on public.policy_pages(document_id, page_number);

create table if not exists public.policy_clauses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.policy_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  clause_index integer not null check (clause_index >= 0),
  clause_ref text check (clause_ref is null or char_length(clause_ref) <= 60),
  heading text check (heading is null or char_length(heading) <= 300),
  section text check (section is null or char_length(section) <= 300),
  page_number integer not null check (page_number >= 1),
  continued boolean not null default false,
  text text not null check (char_length(text) <= 60000),
  unique (document_id, clause_index)
);

create index if not exists policy_clauses_document_idx on public.policy_clauses(document_id, clause_index);

create or replace function public.set_policy_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists policy_documents_set_updated_at on public.policy_documents;
create trigger policy_documents_set_updated_at
before update on public.policy_documents
for each row
execute function public.set_policy_documents_updated_at();

alter table public.policy_documents enable row level security;
alter table public.policy_pages enable row level security;
alter table public.policy_clauses enable row level security;

create policy "policy_documents_select_own" on public.policy_documents
for select using (auth.uid() = user_id);
create policy "policy_documents_insert_own" on public.policy_documents
for insert with check (auth.uid() = user_id);
create policy "policy_documents_update_own" on public.policy_documents
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "policy_documents_delete_own" on public.policy_documents
for delete using (auth.uid() = user_id);

-- Child rows must belong to a document owned by the same user, not merely carry the user's id.
create policy "policy_pages_select_own" on public.policy_pages
for select using (auth.uid() = user_id);
create policy "policy_pages_insert_own" on public.policy_pages
for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.policy_documents d where d.id = document_id and d.user_id = auth.uid())
);
create policy "policy_pages_update_own" on public.policy_pages
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "policy_pages_delete_own" on public.policy_pages
for delete using (auth.uid() = user_id);

create policy "policy_clauses_select_own" on public.policy_clauses
for select using (auth.uid() = user_id);
create policy "policy_clauses_insert_own" on public.policy_clauses
for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.policy_documents d where d.id = document_id and d.user_id = auth.uid())
);
create policy "policy_clauses_delete_own" on public.policy_clauses
for delete using (auth.uid() = user_id);
