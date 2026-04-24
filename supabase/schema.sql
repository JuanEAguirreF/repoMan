-- Enums
create type app_role as enum ('super_admin', 'uploader');
create type file_status as enum ('active', 'pending_deletion', 'deleted');
create type deletion_request_status as enum ('pending', 'approved', 'rejected');

-- User profiles mapped to Supabase auth users
create table if not exists users_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role app_role not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Main files table (binary remains on backend filesystem)
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users_profiles(id),
  title text not null,
  slug text not null unique,
  description text not null,
  category text not null,
  content_origin text not null default 'manga' check (content_origin in ('manga', 'manhwa', 'manhua')),
  tags text[] not null default '{}',
  original_filename text not null,
  stored_filename text not null,
  file_path text not null,
  cover_image_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  has_backup boolean not null default true,
  status file_status not null default 'active',
  is_public boolean not null default true,
  allow_download boolean not null default false,
  storage_backend text not null default 'local_fs',
  external_sync_status text not null default 'not_synced',
  external_sync_metadata jsonb not null default '{}'::jsonb,
  extra_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint files_no_download check (allow_download = false)
);

-- Deletion requests
create table if not exists deletion_requests (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references files(id),
  requested_by_user_id uuid not null references users_profiles(id),
  reason text null,
  status deletion_request_status not null default 'pending',
  reviewed_by_user_id uuid null references users_profiles(id),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz null
);

-- Generic audit log
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references users_profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists system_settings (
  key text primary key,
  value_text text not null,
  updated_at timestamptz not null default now()
);

-- Useful indexes
create index if not exists idx_users_profiles_auth_user_id on users_profiles(auth_user_id);
create index if not exists idx_files_owner_user_id on files(owner_user_id);
create index if not exists idx_files_status_public on files(status, is_public);
create index if not exists idx_deletion_requests_status on deletion_requests(status);
create index if not exists idx_deletion_requests_file_id on deletion_requests(file_id);
create index if not exists idx_audit_logs_actor on audit_logs(actor_user_id);
create index if not exists idx_audit_logs_target on audit_logs(target_type, target_id);

-- Prevent duplicate pending request per file
create unique index if not exists idx_unique_pending_deletion_request
  on deletion_requests(file_id)
  where status = 'pending';

-- Public-safe view (metadata only, no file_path)
create or replace view public_catalog_files as
select
  f.id,
  f.title,
  f.slug,
  f.description,
  f.category,
  f.content_origin,
  f.tags,
  f.mime_type,
  f.file_size_bytes,
  f.has_backup,
  f.cover_image_path,
  f.created_at,
  f.published_at
from files f
where f.is_public = true and f.status = 'active';
