-- SPIKE Social System V2
-- Server-side connection search, privacy-aware mutual connections,
-- cross-device social broadcasts, and robust follow notifications.

create or replace function public.get_spike_profile_social_list_v2(
  p_owner uuid,
  p_kind text,
  p_limit integer default 30,
  p_offset integer default 0,
  p_search text default null
)
returns table(id uuid, display_name text, username text, avatar_url text)
language plpgsql
stable
security definer
set search_path = 'pg_catalog','public','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit,30),50));
  v_offset integer := greatest(0, coalesce(p_offset,0));
  v_search text := left(lower(btrim(coalesce(p_search,''))),80);
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_owner is null or p_kind not in ('followers','following','blocked') then
    raise exception 'Invalid social list request';
  end if;
  if p_kind='blocked' then
    if p_owner is distinct from v_uid then
      raise exception 'You can only view your own blocked list' using errcode='42501';
    end if;
  elsif not public.can_view_spike_friends(v_uid,p_owner) then
    raise exception 'This member has chosen to keep their connections private' using errcode='42501';
  end if;

  return query
  with target_ids as (
    select case
      when jsonb_typeof(x.value)='string' then x.value #>> '{}'
      when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id')
      else null end as user_id,
      x.ordinality as sort_order
    from public.app_documents d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.data->'following')='array' then d.data->'following' else '[]'::jsonb end
    ) with ordinality x(value,ordinality)
    where p_kind='following'
      and d.collection_name='users'
      and d.document_id=p_owner::text
      and d.path='users/'||p_owner::text

    union all

    select coalesce(d.owner_id::text,d.document_id) as user_id, 0::bigint as sort_order
    from public.app_documents d
    where p_kind='followers'
      and d.collection_name='users'
      and d.path='users/'||d.document_id
      and d.document_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (d.owner_id is null or d.owner_id<>p_owner)
      and (
        d.data->'following' @> jsonb_build_array(p_owner::text)
        or d.data->'following' @> jsonb_build_array(jsonb_build_object('id',p_owner::text))
        or d.data->'following' @> jsonb_build_array(jsonb_build_object('user_id',p_owner::text))
      )

    union all

    select b.blocked_id::text,0::bigint
    from public.private_message_blocks b
    where p_kind='blocked' and b.blocker_id=v_uid
  ), valid_ids as (
    select t.user_id,min(t.sort_order) as sort_order
    from target_ids t
    where t.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    group by t.user_id
  ), visible as (
    select v.user_id::uuid as id,
      coalesce(nullif(p.display_name,''),nullif(p.full_name,''),nullif(p.username,''),
        nullif(d.data->>'display_name',''),nullif(d.data->>'full_name',''),nullif(d.data->>'username',''),
        'Profile not synced') as display_name,
      case when p.id is null then '__profile_missing__'
        else coalesce(nullif(p.username,''),nullif(d.data->>'username','')) end as username,
      coalesce(nullif(p.avatar_url,''),nullif(d.data->>'avatar_url','')) as avatar_url,
      v.sort_order
    from valid_ids v
    left join public.profiles p on p.id::text=v.user_id
    left join public.app_documents d on d.collection_name='users'
      and d.document_id=v.user_id and d.path='users/'||v.user_id
    where v.user_id<>p_owner::text
      and (
        p_kind='blocked'
        or p_owner=v_uid
        or (p.id is not null
          and public.can_discover_spike_profile(v_uid,p.id)
          and not exists(select 1 from public.private_message_blocks b
            where (b.blocker_id=v_uid and b.blocked_id=p.id)
               or (b.blocker_id=p.id and b.blocked_id=v_uid)))
      )
  )
  select v.id,v.display_name,v.username,v.avatar_url
  from visible v
  where v_search=''
     or position(v_search in lower(concat_ws(' ',v.display_name,
       case when v.username='__profile_missing__' then 'unavailable account' else coalesce(v.username,'') end)))>0
  order by v.sort_order,v.id
  limit v_limit offset v_offset;
end;
$function$;

revoke all on function public.get_spike_profile_social_list_v2(uuid,text,integer,integer,text) from public,anon;
grant execute on function public.get_spike_profile_social_list_v2(uuid,text,integer,integer,text) to authenticated;

create or replace function public.get_spike_mutual_connections(
  p_other_user_id uuid,
  p_limit integer default 30,
  p_offset integer default 0,
  p_search text default null
)
returns table(id uuid, display_name text, username text, avatar_url text, total_count bigint)
language plpgsql
stable
security definer
set search_path = 'pg_catalog','public','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit,30),50));
  v_offset integer := greatest(0, coalesce(p_offset,0));
  v_search text := left(lower(btrim(coalesce(p_search,''))),80);
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_other_user_id is null or p_other_user_id=v_uid then raise exception 'Mutual connections are available on another member profile'; end if;
  if not public.can_view_spike_friends(v_uid,p_other_user_id) then
    raise exception 'This member has chosen to keep their connections private' using errcode='42501';
  end if;

  return query
  with viewer_following as (
    select distinct case
      when jsonb_typeof(x.value)='string' then x.value #>> '{}'
      when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id')
      else null end as user_id
    from public.app_documents d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.data->'following')='array' then d.data->'following' else '[]'::jsonb end
    ) x(value)
    where d.collection_name='users' and d.document_id=v_uid::text and d.path='users/'||v_uid::text
  ), owner_following as (
    select distinct case
      when jsonb_typeof(x.value)='string' then x.value #>> '{}'
      when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id')
      else null end as user_id
    from public.app_documents d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.data->'following')='array' then d.data->'following' else '[]'::jsonb end
    ) x(value)
    where d.collection_name='users' and d.document_id=p_other_user_id::text and d.path='users/'||p_other_user_id::text
  ), mutual_ids as (
    select a.user_id
    from viewer_following a join owner_following b using(user_id)
    where a.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and a.user_id not in (v_uid::text,p_other_user_id::text)
  ), visible as (
    select p.id,
      coalesce(nullif(p.display_name,''),nullif(p.full_name,''),nullif(p.username,''),'SPIKE member') as display_name,
      coalesce(p.username,'') as username,
      coalesce(p.avatar_url,'') as avatar_url
    from mutual_ids m
    join public.profiles p on p.id::text=m.user_id
    where public.can_discover_spike_profile(v_uid,p.id)
      and not exists (
        select 1 from public.private_message_blocks b
        where (b.blocker_id=v_uid and b.blocked_id=p.id)
           or (b.blocker_id=p.id and b.blocked_id=v_uid)
           or (b.blocker_id=p_other_user_id and b.blocked_id=p.id)
           or (b.blocker_id=p.id and b.blocked_id=p_other_user_id)
      )
      and (v_search='' or position(v_search in lower(concat_ws(' ',p.display_name,p.full_name,p.username)))>0)
  )
  select v.id,v.display_name,v.username,v.avatar_url,count(*) over()::bigint
  from visible v
  order by lower(v.display_name),v.id
  limit v_limit offset v_offset;
end;
$function$;

revoke all on function public.get_spike_mutual_connections(uuid,integer,integer,text) from public,anon;
grant execute on function public.get_spike_mutual_connections(uuid,integer,integer,text) to authenticated;

-- Realtime clients may subscribe only to their own private social topic.
drop policy if exists "spike users can receive social connection broadcasts" on realtime.messages;
create policy "spike users can receive social connection broadcasts"
on realtime.messages for select to authenticated
using (
  auth.uid() is not null
  and topic = 'user:' || (select auth.uid())::text || ':social'
);

-- Keep follow notifications and realtime events correct for both legacy
-- string arrays and object-form arrays ({id} / {user_id}).
create or replace function private.trg_user_follow_notifications()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog','public','private','pg_temp'
as $function$
declare
  v_actor uuid;
  v_actor_name text;
  v_old_ids text[] := array[]::text[];
  v_new_ids text[] := array[]::text[];
  v_target_text text;
  v_action text;
begin
  if new.collection_name <> 'users' then return new; end if;
  if new.owner_id is not null then
    v_actor := new.owner_id;
  elsif new.document_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_actor := new.document_id::uuid;
  end if;
  if v_actor is null then return new; end if;

  if tg_op='UPDATE' then
    select coalesce(array_agg(distinct q.user_id order by q.user_id),array[]::text[])
      into v_old_ids
    from (
      select case
        when jsonb_typeof(x.value)='string' then x.value #>> '{}'
        when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id')
        else null end as user_id
      from jsonb_array_elements(case when jsonb_typeof(old.data->'following')='array' then old.data->'following' else '[]'::jsonb end) x(value)
    ) q
    where q.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and q.user_id<>v_actor::text;
  end if;

  select coalesce(array_agg(distinct q.user_id order by q.user_id),array[]::text[])
    into v_new_ids
  from (
    select case
      when jsonb_typeof(x.value)='string' then x.value #>> '{}'
      when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id')
      else null end as user_id
    from jsonb_array_elements(case when jsonb_typeof(new.data->'following')='array' then new.data->'following' else '[]'::jsonb end) x(value)
  ) q
  where q.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and q.user_id<>v_actor::text;

  if v_old_ids is not distinct from v_new_ids then return new; end if;

  select coalesce(p.display_name,p.username,'Someone') into v_actor_name
  from public.profiles p where p.id=v_actor;
  v_actor_name := coalesce(v_actor_name,'Someone');

  -- Notification preferences are enforced by the existing notifications guard.
  foreach v_target_text in array v_new_ids loop
    if not (v_target_text=any(v_old_ids)) then
      perform private.emit_notification(
        v_target_text::uuid,
        'follow',
        jsonb_build_object('actor_id',v_actor,'actor_name',v_actor_name,
          'title','New follower','body',v_actor_name||' started following you'),
        'normal',
        'follow:'||v_actor::text||':'||v_target_text||':'||md5(new.updated_at::text||':'||v_target_text),
        'follow:'||v_target_text,
        null
      );
    end if;
  end loop;

  -- Private, ID-only events refresh the actor's and target's connected devices.
  begin
    for v_target_text in
      select distinct x.user_id from unnest(v_old_ids||v_new_ids) as x(user_id)
    loop
      if (v_target_text=any(v_new_ids)) is distinct from (v_target_text=any(v_old_ids)) then
        v_action := case when v_target_text=any(v_new_ids) then 'follow' else 'unfollow' end;
        perform realtime.send(
          jsonb_build_object('actor_id',v_actor,'target_id',v_target_text::uuid,'action',v_action,'changed_at',now()),
          'social_connection_changed',
          'user:'||v_actor::text||':social',
          true
        );
        perform realtime.send(
          jsonb_build_object('actor_id',v_actor,'target_id',v_target_text::uuid,'action',v_action,'changed_at',now()),
          'social_connection_changed',
          'user:'||v_target_text||':social',
          true
        );
      end if;
    end loop;
  exception when others then
    raise warning '[SPIKE social realtime] %',sqlerrm;
  end;
  return new;
end;
$function$;
