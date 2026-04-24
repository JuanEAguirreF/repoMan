do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    where t.typname = 'file_status'
      and e.enumlabel = 'pending_review'
  ) then
    alter type public.file_status add value 'pending_review';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on t.oid = e.enumtypid
    where t.typname = 'file_status'
      and e.enumlabel = 'rejected_review'
  ) then
    alter type public.file_status add value 'rejected_review';
  end if;
end $$;
