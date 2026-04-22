alter table if exists public.files
  add column if not exists slug text;

with normalized as (
  select
    f.id,
    case
      when trim(both '-' from regexp_replace(lower(coalesce(f.title, '')), '[^a-z0-9]+', '-', 'g')) = '' then 'item'
      else trim(both '-' from regexp_replace(lower(coalesce(f.title, '')), '[^a-z0-9]+', '-', 'g'))
    end as base_slug,
    row_number() over (
      partition by case
        when trim(both '-' from regexp_replace(lower(coalesce(f.title, '')), '[^a-z0-9]+', '-', 'g')) = '' then 'item'
        else trim(both '-' from regexp_replace(lower(coalesce(f.title, '')), '[^a-z0-9]+', '-', 'g'))
      end
      order by f.created_at, f.id
    ) as rn
  from public.files f
),
resolved as (
  select
    id,
    case when rn = 1 then base_slug else base_slug || '-' || rn::text end as final_slug
  from normalized
)
update public.files f
set slug = r.final_slug
from resolved r
where f.id = r.id
  and (f.slug is null or f.slug = '');

alter table if exists public.files
  alter column slug set not null;

create unique index if not exists idx_files_slug_unique on public.files(slug);

