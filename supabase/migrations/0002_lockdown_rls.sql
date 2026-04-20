-- Security hardening: enable RLS and lock direct table access from anon/authenticated.
-- App pattern: frontend should use Fastify API only. Backend uses service role key.

alter table if exists public.users_profiles enable row level security;
alter table if exists public.files enable row level security;
alter table if exists public.deletion_requests enable row level security;
alter table if exists public.audit_logs enable row level security;

-- Force RLS to avoid accidental bypass for non-superusers.
alter table if exists public.users_profiles force row level security;
alter table if exists public.files force row level security;
alter table if exists public.deletion_requests force row level security;
alter table if exists public.audit_logs force row level security;

-- Remove direct table privileges from low-privilege roles.
revoke all on table public.users_profiles from anon, authenticated;
revoke all on table public.files from anon, authenticated;
revoke all on table public.deletion_requests from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

-- View should also be backend-only in this architecture.
revoke all on table public.public_catalog_files from anon, authenticated;
