alter table if exists public.files
  add column if not exists author text null;

alter table if exists public.files
  add column if not exists artist text null;

