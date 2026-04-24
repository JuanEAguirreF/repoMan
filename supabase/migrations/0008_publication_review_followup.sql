alter table if exists public.files
  alter column status set default 'pending_review';

alter table if exists public.files
  alter column is_public set default false;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'edit_request_status') then
    create type public.edit_request_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

create table if not exists public.file_edit_requests (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  requested_by_user_id uuid not null references public.users_profiles(id),
  reason text null,
  proposed_patch jsonb not null default '{}'::jsonb,
  status public.edit_request_status not null default 'pending',
  reviewed_by_user_id uuid null references public.users_profiles(id),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz null
);

create index if not exists idx_file_edit_requests_status on public.file_edit_requests(status);
create index if not exists idx_file_edit_requests_file_id on public.file_edit_requests(file_id);

create unique index if not exists idx_unique_pending_edit_request
  on public.file_edit_requests(file_id)
  where status = 'pending';

alter table if exists public.system_settings enable row level security;
alter table if exists public.system_settings force row level security;
revoke all on table public.system_settings from anon, authenticated;

alter table if exists public.file_edit_requests enable row level security;
alter table if exists public.file_edit_requests force row level security;
revoke all on table public.file_edit_requests from anon, authenticated;
