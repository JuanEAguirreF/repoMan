create table if not exists public.system_settings (
  key text primary key,
  value_text text not null,
  updated_at timestamptz not null default now()
);

insert into public.system_settings (key, value_text)
values ('max_file_size_bytes', '209715200')
on conflict (key) do nothing;

