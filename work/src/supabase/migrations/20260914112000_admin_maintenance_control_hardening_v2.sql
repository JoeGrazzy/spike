-- Keep the admin maintenance control aligned with the live production function.
drop function if exists public.admin_set_maintenance(boolean,text,text,timestamptz,timestamptz);
create function public.admin_set_maintenance(
  p_enabled boolean,
  p_title text,
  p_message text,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns public.app_maintenance
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.app_maintenance;
begin
  if coalesce(public.admin_guard(), false) is not true then
    raise exception 'Administrator authorization required';
  end if;
  if p_enabled is true and p_ends_at is not null and p_ends_at <= coalesce(p_starts_at, now()) then
    raise exception 'Maintenance end time must be after the start time';
  end if;
  insert into public.app_maintenance(id, enabled, title, message, starts_at, ends_at, updated_at)
  values (true, coalesce(p_enabled,false), coalesce(nullif(btrim(p_title),''),'SPIKE is under maintenance'), coalesce(nullif(btrim(p_message),''),'We will be back shortly'), coalesce(p_starts_at, case when p_enabled then now() else null end), p_ends_at, now())
  on conflict (id) do update set enabled=excluded.enabled,title=excluded.title,message=excluded.message,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now()
  returning * into r;
  return r;
end;
$$;
revoke all on function public.admin_set_maintenance(boolean,text,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.admin_set_maintenance(boolean,text,text,timestamptz,timestamptz) to authenticated;
