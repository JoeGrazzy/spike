-- SPIKE Verified Activity Centre: metadata-only event history, visible to the owner only.
begin;
create table if not exists private.spike_verified_activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  source_table text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists spike_verified_activity_user_time_idx
  on private.spike_verified_activity_events(user_id, created_at desc);
create index if not exists spike_verified_activity_time_idx
  on private.spike_verified_activity_events(created_at desc);
alter table private.spike_verified_activity_events enable row level security;
revoke all on private.spike_verified_activity_events from public, anon, authenticated;

create or replace function private.spike_log_verified_user_activity()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_actor uuid; v_type text; v_actor_column text;
begin
  v_actor_column := case tg_table_name
    when 'posts' then 'author_id'
    when 'comments' then 'author_id'
    when 'messages' then 'sender_id'
    when 'room_messages' then 'sender_id'
    else 'id' end;
  v_actor := nullif(to_jsonb(new)->>v_actor_column, '')::uuid;
  if v_actor is null then return new; end if;
  if not exists(select 1 from public.profiles p where p.id=v_actor and p.is_verified is true and p.account_status='active') then return new; end if;
  v_type := case tg_table_name
    when 'posts' then 'Published a post'
    when 'comments' then 'Posted a comment'
    when 'messages' then 'Sent a direct message'
    when 'room_messages' then 'Sent a room message'
    else 'Account activity' end;
  insert into private.spike_verified_activity_events(user_id,event_type,source_table)
  values(v_actor,v_type,tg_table_name);
  return new;
exception when others then
  -- Activity logging must never block a user's underlying action.
  return new;
end;
$$;

-- Install only where the expected table exists; this keeps deployments compatible with staged schemas.
do $$
declare t text;
begin
  foreach t in array array['posts','comments','messages','room_messages'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists spike_verified_activity_log on public.%I',t);
      execute format('create trigger spike_verified_activity_log after insert on public.%I for each row execute function private.spike_log_verified_user_activity()',t);
    end if;
  end loop;
end $$;

create or replace function public.spike_admin_get_verified_activity(p_limit integer default 100, p_search text default '')
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if not private.is_admin() then
    raise exception 'Only the SPIKE owner can view verified user activity.' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select e.id,e.event_type,e.created_at,p.id as user_id,p.username,p.display_name,p.spike_id,p.is_verified
      from private.spike_verified_activity_events e
      join public.profiles p on p.id=e.user_id
      where p.is_verified is true and p.account_status='active'
        and (nullif(btrim(p_search),'') is null or p.username ilike '%'||btrim(p_search)||'%' or p.display_name ilike '%'||btrim(p_search)||'%')
      order by e.created_at desc limit greatest(1,least(coalesce(p_limit,100),250))
    ) x
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.spike_admin_get_verified_activity(integer,text) from public,anon;
grant execute on function public.spike_admin_get_verified_activity(integer,text) to authenticated;
commit;
