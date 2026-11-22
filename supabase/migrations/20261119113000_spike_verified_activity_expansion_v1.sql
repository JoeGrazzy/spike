-- SPIKE Phase 35: expand verified-user activity using confirmed source tables only.
begin;

alter table private.spike_verified_activity_events
  add column if not exists category text not null default 'content';

create index if not exists spike_verified_activity_category_time_idx
  on private.spike_verified_activity_events(category, created_at desc);

-- Shared guard: only record activity for a currently verified, active account.
create or replace function private.spike_record_verified_activity(p_user_id uuid, p_event_type text, p_category text, p_source_table text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if p_user_id is null or p_event_type is null or p_category is null then return; end if;
  if exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.is_verified is true and p.account_status = 'active'
  ) then
    insert into private.spike_verified_activity_events(user_id,event_type,category,source_table)
    values(p_user_id,left(p_event_type,120),left(p_category,24),left(p_source_table,64));
  end if;
exception when others then
  -- Logging must never interrupt the underlying social or account action.
  return;
end;
$$;

create or replace function private.spike_log_verified_like()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  perform private.spike_record_verified_activity(new.user_id,'Liked a post','social','post_likes');
  return new;
end;
$$;

drop trigger if exists spike_verified_activity_like on public.post_likes;
create trigger spike_verified_activity_like after insert on public.post_likes
for each row execute function private.spike_log_verified_like();

create or replace function private.spike_log_verified_follow()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    perform private.spike_record_verified_activity(new.follower_id,'Started following another account','social','follows');
  end if;
  return new;
end;
$$;

drop trigger if exists spike_verified_activity_follow on public.follows;
create trigger spike_verified_activity_follow after insert or update of status on public.follows
for each row execute function private.spike_log_verified_follow();

create or replace function private.spike_log_verified_subscription()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'active' and new.valid_until > clock_timestamp() then
      perform private.spike_record_verified_activity(new.user_id,'Verified subscription activated','membership','spike_verified_subscriptions');
    end if;
  else
    if new.status = 'active' and new.valid_until > clock_timestamp() and
       (old.status is distinct from 'active' or new.valid_until > old.valid_until) then
      perform private.spike_record_verified_activity(new.user_id,
        case when old.status = 'active' then 'Verified subscription renewed' else 'Verified subscription activated' end,
        'membership','spike_verified_subscriptions');
    elsif old.status = 'active' and (new.status = 'expired' or new.valid_until <= clock_timestamp()) then
      perform private.spike_record_verified_activity(new.user_id,'Verified subscription expired','membership','spike_verified_subscriptions');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists spike_verified_activity_subscription on public.spike_verified_subscriptions;
create trigger spike_verified_activity_subscription after insert or update of status, valid_until on public.spike_verified_subscriptions
for each row execute function private.spike_log_verified_subscription();

create or replace function private.spike_log_verified_profile_update()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if new.is_verified is true and new.account_status = 'active' and (
    new.username is distinct from old.username or
    new.display_name is distinct from old.display_name or
    new.bio is distinct from old.bio or
    new.avatar_path is distinct from old.avatar_path or
    new.cover_path is distinct from old.cover_path or
    new.website is distinct from old.website or
    new.location is distinct from old.location
  ) then
    perform private.spike_record_verified_activity(new.id,'Updated profile','profile','profiles');
  end if;
  return new;
end;
$$;

drop trigger if exists spike_verified_activity_profile_update on public.profiles;
create trigger spike_verified_activity_profile_update after update of username, display_name, bio, avatar_path, cover_path, website, location on public.profiles
for each row execute function private.spike_log_verified_profile_update();

-- Replace the Phase 34 two-argument RPC with a category-filtered owner-only RPC.
drop function if exists public.spike_admin_get_verified_activity(integer,text);
create function public.spike_admin_get_verified_activity(
  p_limit integer default 100,
  p_search text default '',
  p_category text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if not private.is_admin() then
    raise exception 'Only the SPIKE owner can view verified user activity.' using errcode='42501';
  end if;
  if coalesce(p_category,'all') not in ('all','content','social','membership','profile') then
    raise exception 'Invalid activity category.' using errcode='22023';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select e.id,e.event_type,e.category,e.created_at,p.id as user_id,p.username,p.display_name,p.spike_id,p.is_verified
      from private.spike_verified_activity_events e
      join public.profiles p on p.id=e.user_id
      where p.is_verified is true and p.account_status='active'
        and (nullif(btrim(p_search),'') is null or p.username ilike '%'||btrim(p_search)||'%' or p.display_name ilike '%'||btrim(p_search)||'%')
        and (coalesce(p_category,'all')='all' or e.category=p_category)
      order by e.created_at desc
      limit greatest(1,least(coalesce(p_limit,100),250))
    ) x
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.spike_admin_get_verified_activity(integer,text,text) from public,anon;
grant execute on function public.spike_admin_get_verified_activity(integer,text,text) to authenticated;

commit;
