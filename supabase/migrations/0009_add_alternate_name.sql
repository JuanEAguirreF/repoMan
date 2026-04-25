alter table if exists public.files
  add column if not exists alternate_name text null;

