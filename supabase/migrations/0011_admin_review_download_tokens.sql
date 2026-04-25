create table if not exists public.admin_review_download_tokens (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  issued_to_user_id uuid not null references public.users_profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz null,
  used_by_ip text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_review_download_tokens_file on public.admin_review_download_tokens(file_id);
create index if not exists idx_admin_review_download_tokens_user on public.admin_review_download_tokens(issued_to_user_id);
create index if not exists idx_admin_review_download_tokens_expires on public.admin_review_download_tokens(expires_at);

alter table if exists public.admin_review_download_tokens enable row level security;
alter table if exists public.admin_review_download_tokens force row level security;
revoke all on table public.admin_review_download_tokens from anon, authenticated;
