alter table if exists public.files
  add column if not exists content_origin text not null default 'manga';

alter table if exists public.files
  drop constraint if exists files_content_origin_check;

alter table if exists public.files
  add constraint files_content_origin_check
  check (content_origin in ('manga', 'manhwa', 'manhua'));

