create table if not exists public.profile_cover_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cover_url text not null default '',
  position_x numeric not null default 0,
  position_y numeric not null default 0,
  zoom numeric not null default 1,
  fit text not null default 'cover',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint profile_cover_settings_position_x_chk check (position_x between -40 and 40),
  constraint profile_cover_settings_position_y_chk check (position_y between -40 and 40),
  constraint profile_cover_settings_zoom_chk check (zoom between 1 and 2.5),
  constraint profile_cover_settings_fit_chk check (fit in ('cover'))
);

alter table public.profile_cover_settings enable row level security;

drop policy if exists "profile cover owner read" on public.profile_cover_settings;
drop policy if exists "profile cover owner write" on public.profile_cover_settings;

create policy "profile cover owner read" on public.profile_cover_settings for select to authenticated using (user_id = auth.uid());
create policy "profile cover owner write" on public.profile_cover_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into public.profile_cover_settings(user_id, cover_url)
select u.owner_id, coalesce(u.data->>'cover_url','')
from public.app_documents u
where u.path like 'users/%' and u.owner_id is not null and coalesce(u.data->>'cover_url','') <> ''
on conflict (user_id) do update set cover_url = case when public.profile_cover_settings.cover_url = '' then excluded.cover_url else public.profile_cover_settings.cover_url end, updated_at = now();

create or replace function public.save_spike_cover_settings(p_cover_url text, p_position_x numeric default 0, p_position_y numeric default 0, p_zoom numeric default 1, p_fit text default 'cover')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_url text := trim(coalesce(p_cover_url,'')); v_x numeric := greatest(-40, least(40, coalesce(p_position_x,0))); v_y numeric := greatest(-40, least(40, coalesce(p_position_y,0))); v_zoom numeric := greatest(1, least(2.5, coalesce(p_zoom,1))); v_fit text := coalesce(nullif(trim(p_fit),''),'cover');
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(v_url) > 2048 then raise exception 'Cover image URL is too long'; end if;
  if v_fit <> 'cover' then raise exception 'Unsupported cover fit'; end if;
  insert into public.profile_cover_settings(user_id,cover_url,position_x,position_y,zoom,fit,updated_at) values(v_uid,v_url,v_x,v_y,v_zoom,v_fit,now())
  on conflict(user_id) do update set cover_url=excluded.cover_url,position_x=excluded.position_x,position_y=excluded.position_y,zoom=excluded.zoom,fit=excluded.fit,updated_at=now();
  return jsonb_build_object('ok',true,'user_id',v_uid,'cover_url',v_url,'position_x',v_x,'position_y',v_y,'zoom',v_zoom,'fit',v_fit);
end; $$;

revoke execute on function public.save_spike_cover_settings(text,numeric,numeric,numeric,text) from public, anon;
grant execute on function public.save_spike_cover_settings(text,numeric,numeric,numeric,text) to authenticated;

create or replace function public.get_public_cover_settings(p_user_ids uuid[])
returns table(user_id uuid, cover_url text, position_x numeric, position_y numeric, zoom numeric, fit text)
language sql security definer stable set search_path = public, pg_temp as $$
  select s.user_id,s.cover_url,s.position_x,s.position_y,s.zoom,s.fit
  from public.profile_cover_settings s join public.profiles p on p.id=s.user_id left join public.profile_privacy pp on pp.user_id=s.user_id
  where s.user_id = any(coalesce(p_user_ids, '{}'::uuid[])) and (s.user_id = auth.uid() or coalesce(pp.profile_visibility,'public') = 'public');
$$;

revoke execute on function public.get_public_cover_settings(uuid[]) from public, anon;
grant execute on function public.get_public_cover_settings(uuid[]) to authenticated;
