alter table if exists public.files
  add column if not exists has_backup boolean not null default true;

update public.files
set has_backup = true
where has_backup is null;
