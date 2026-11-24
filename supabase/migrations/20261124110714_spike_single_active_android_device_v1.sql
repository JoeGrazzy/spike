create table if not exists public.spike_android_device_lock (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id text not null,
  user_agent text,
  updated_at timestamptz not null default now()
);

alter table public.spike_android_device_lock enable row level security;
revoke all on table public.spike_android_device_lock from anon, authenticated;

create or replace function public.spike_register_android_device(p_device_id text, p_user_agent text default null)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_device_id is null or length(btrim(p_device_id)) < 20 or length(p_device_id) > 128 then raise exception 'Invalid device identifier'; end if;
  insert into public.spike_android_device_lock(user_id, device_id, user_agent, updated_at)
  values (v_user_id, p_device_id, left(coalesce(p_user_agent, ''), 512), now())
  on conflict (user_id) do update set device_id = excluded.device_id, user_agent = excluded.user_agent, updated_at = now();
  return true;
end; $$;

create or replace function public.spike_is_current_android_device(p_device_id text)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.spike_android_device_lock d where d.user_id = auth.uid() and d.device_id = p_device_id);
$$;

revoke all on function public.spike_register_android_device(text, text) from public, anon;
revoke all on function public.spike_is_current_android_device(text) from public, anon;
grant execute on function public.spike_register_android_device(text, text) to authenticated;
grant execute on function public.spike_is_current_android_device(text) to authenticated;
