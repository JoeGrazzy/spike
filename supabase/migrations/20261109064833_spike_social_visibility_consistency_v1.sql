-- SPIKE social visibility consistency v1.
-- Make list, count, and mutual-connection reads use the same symmetric block rules.
-- Keep app_documents.users.following as the only canonical relationship store.

create or replace function private.spike_social_pair_is_unblocked(p_left uuid, p_right uuid)
returns boolean
language sql
stable
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select p_left is not null
     and p_right is not null
     and not exists (
       select 1 from public.private_message_blocks b
       where (b.blocker_id = p_left and b.blocked_id = p_right)
          or (b.blocker_id = p_right and b.blocked_id = p_left)
     )
     and not exists (
       select 1 from public.feed_blocks b
       where (b.blocker_id = p_left and b.blocked_id = p_right)
          or (b.blocker_id = p_right and b.blocked_id = p_left)
     );
$function$;
revoke all on function private.spike_social_pair_is_unblocked(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_spike_profile_follow_counts(p_owner uuid)
returns table(followers_count bigint, following_count bigint)
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  with owner_doc as (
    select case when jsonb_typeof(data->'following') = 'array' then data->'following' else '[]'::jsonb end following
    from public.app_documents
    where collection_name = 'users'
      and document_id = p_owner::text
      and path = 'users/' || p_owner::text
    limit 1
  ), counts as (
    select
      (
        select count(distinct d.document_id)::bigint
        from public.app_documents d
        join public.profiles p on p.id::text = d.document_id
        where d.collection_name = 'users'
          and d.path = 'users/' || d.document_id
          and d.document_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and d.document_id <> p_owner::text
          and (d.owner_id is null or d.owner_id = d.document_id::uuid)
          and (
            d.data->'following' @> jsonb_build_array(p_owner::text)
            or d.data->'following' @> jsonb_build_array(jsonb_build_object('id', p_owner::text))
            or d.data->'following' @> jsonb_build_array(jsonb_build_object('user_id', p_owner::text))
          )
          and (auth.uid() = p_owner or public.can_discover_spike_profile(auth.uid(), p.id))
          and private.spike_social_pair_is_unblocked(p_owner, p.id)
          and private.spike_social_pair_is_unblocked(auth.uid(), p.id)
      ) as followers_count,
      (
        select count(distinct f.user_id)::bigint
        from owner_doc o
        cross join lateral (
          select case
            when jsonb_typeof(x.value) = 'string' then x.value #>> '{}'
            when jsonb_typeof(x.value) = 'object' then coalesce(x.value->>'id', x.value->>'user_id')
            else null
          end as user_id
          from jsonb_array_elements(o.following) x(value)
        ) f
        left join public.profiles p on p.id::text = f.user_id
        where f.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and f.user_id <> p_owner::text
          and private.spike_social_pair_is_unblocked(p_owner, f.user_id::uuid)
          and private.spike_social_pair_is_unblocked(auth.uid(), f.user_id::uuid)
          and (
            auth.uid() = p_owner
            or (p.id is not null and public.can_discover_spike_profile(auth.uid(), p.id))
          )
      ) as following_count
  )
  select
    case
      when auth.uid() is not null
       and public.can_view_spike_friends(auth.uid(), p_owner)
       and public.can_discover_spike_profile(auth.uid(), p_owner)
       and private.spike_social_pair_is_unblocked(auth.uid(), p_owner)
      then counts.followers_count else 0 end,
    case
      when auth.uid() is not null
       and public.can_view_spike_friends(auth.uid(), p_owner)
       and public.can_discover_spike_profile(auth.uid(), p_owner)
       and private.spike_social_pair_is_unblocked(auth.uid(), p_owner)
      then counts.following_count else 0 end
  from counts
  where p_owner is not null;
$function$;
revoke all on function public.get_spike_profile_follow_counts(uuid) from public, anon;
grant execute on function public.get_spike_profile_follow_counts(uuid) to authenticated;

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
set search_path = 'pg_catalog', 'public', 'private', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := left(lower(btrim(coalesce(p_search, ''))), 80);
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_owner is null or p_kind not in ('followers', 'following', 'blocked') then
    raise exception 'Invalid social list request';
  end if;
  if p_kind = 'blocked' then
    if p_owner is distinct from v_uid then
      raise exception 'You can only view your own blocked list' using errcode = '42501';
    end if;
  elsif not public.can_view_spike_friends(v_uid, p_owner)
     or not public.can_discover_spike_profile(v_uid, p_owner)
     or not private.spike_social_pair_is_unblocked(v_uid, p_owner) then
    raise exception 'This member has chosen to keep their connections private' using errcode = '42501';
  end if;

  return query
  with target_ids as (
    select
      case
        when jsonb_typeof(x.value) = 'string' then x.value #>> '{}'
        when jsonb_typeof(x.value) = 'object' then coalesce(x.value->>'id', x.value->>'user_id')
        else null
      end as user_id,
      x.ordinality as sort_order
    from public.app_documents d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.data->'following') = 'array' then d.data->'following' else '[]'::jsonb end
    ) with ordinality x(value, ordinality)
    where p_kind = 'following'
      and d.collection_name = 'users'
      and d.document_id = p_owner::text
      and d.path = 'users/' || p_owner::text

    union all

    select d.document_id as user_id, 0::bigint as sort_order
    from public.app_documents d
    join public.profiles follower_profile on follower_profile.id::text = d.document_id
    where p_kind = 'followers'
      and d.collection_name = 'users'
      and d.path = 'users/' || d.document_id
      and d.document_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (d.owner_id is null or d.owner_id = d.document_id::uuid)
      and d.document_id <> p_owner::text
      and (
        d.data->'following' @> jsonb_build_array(p_owner::text)
        or d.data->'following' @> jsonb_build_array(jsonb_build_object('id', p_owner::text))
        or d.data->'following' @> jsonb_build_array(jsonb_build_object('user_id', p_owner::text))
      )

    union all

    select b.blocked_id::text, 0::bigint
    from public.private_message_blocks b
    where p_kind = 'blocked' and b.blocker_id = v_uid
  ), valid_ids as (
    select t.user_id, min(t.sort_order) as sort_order
    from target_ids t
    where t.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    group by t.user_id
  ), visible as (
    select
      v.user_id::uuid as id,
      coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), nullif(p.username, ''),
        nullif(d.data->>'display_name', ''), nullif(d.data->>'full_name', ''),
        nullif(d.data->>'username', ''), 'Profile not synced') as display_name,
      case when p.id is null then '__profile_missing__'
        else coalesce(nullif(p.username, ''), nullif(d.data->>'username', '')) end as username,
      coalesce(nullif(p.avatar_url, ''), nullif(d.data->>'avatar_url', '')) as avatar_url,
      v.sort_order
    from valid_ids v
    left join public.profiles p on p.id::text = v.user_id
    left join public.app_documents d on d.collection_name = 'users'
      and d.document_id = v.user_id and d.path = 'users/' || v.user_id
    where v.user_id <> p_owner::text
      and (
        p_kind = 'blocked'
        or (
          private.spike_social_pair_is_unblocked(p_owner, v.user_id::uuid)
          and private.spike_social_pair_is_unblocked(v_uid, v.user_id::uuid)
          and (
            p_owner = v_uid
            or (p.id is not null and public.can_discover_spike_profile(v_uid, p.id))
          )
        )
      )
  )
  select v.id, v.display_name, v.username, v.avatar_url
  from visible v
  where v_search = ''
     or position(v_search in lower(concat_ws(' ', v.display_name,
       case when v.username = '__profile_missing__' then 'unavailable account' else coalesce(v.username, '') end))) > 0
  order by v.sort_order, v.id
  limit v_limit offset v_offset;
end;
$function$;
revoke all on function public.get_spike_profile_social_list_v2(uuid, text, integer, integer, text) from public, anon;
grant execute on function public.get_spike_profile_social_list_v2(uuid, text, integer, integer, text) to authenticated;

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
set search_path = 'pg_catalog', 'public', 'private', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_search text := left(lower(btrim(coalesce(p_search, ''))), 80);
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_other_user_id is null or p_other_user_id = v_uid then
    raise exception 'Mutual connections are available on another member profile';
  end if;
  if not public.can_view_spike_friends(v_uid, p_other_user_id)
     or not public.can_discover_spike_profile(v_uid, p_other_user_id)
     or not private.spike_social_pair_is_unblocked(v_uid, p_other_user_id) then
    raise exception 'This member has chosen to keep their connections private' using errcode = '42501';
  end if;

  return query
  with viewer_following as (
    select distinct case
      when jsonb_typeof(x.value) = 'string' then x.value #>> '{}'
      when jsonb_typeof(x.value) = 'object' then coalesce(x.value->>'id', x.value->>'user_id')
      else null end as user_id
    from public.app_documents d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.data->'following') = 'array' then d.data->'following' else '[]'::jsonb end
    ) x(value)
    where d.collection_name = 'users' and d.document_id = v_uid::text and d.path = 'users/' || v_uid::text
  ), owner_following as (
    select distinct case
      when jsonb_typeof(x.value) = 'string' then x.value #>> '{}'
      when jsonb_typeof(x.value) = 'object' then coalesce(x.value->>'id', x.value->>'user_id')
      else null end as user_id
    from public.app_documents d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.data->'following') = 'array' then d.data->'following' else '[]'::jsonb end
    ) x(value)
    where d.collection_name = 'users' and d.document_id = p_other_user_id::text and d.path = 'users/' || p_other_user_id::text
  ), mutual_ids as (
    select a.user_id
    from viewer_following a
    join owner_following b using (user_id)
    where a.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and a.user_id not in (v_uid::text, p_other_user_id::text)
  ), visible as (
    select
      p.id,
      coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), nullif(p.username, ''), 'SPIKE member') as display_name,
      coalesce(p.username, '') as username,
      coalesce(p.avatar_url, '') as avatar_url
    from mutual_ids m
    join public.profiles p on p.id::text = m.user_id
    where public.can_discover_spike_profile(v_uid, p.id)
      and private.spike_social_pair_is_unblocked(v_uid, p.id)
      and private.spike_social_pair_is_unblocked(p_other_user_id, p.id)
      and (v_search = '' or position(v_search in lower(concat_ws(' ', p.display_name, p.full_name, p.username))) > 0)
  )
  select v.id, v.display_name, v.username, v.avatar_url, count(*) over()::bigint
  from visible v
  order by lower(v.display_name), v.id
  limit v_limit offset v_offset;
end;
$function$;
revoke all on function public.get_spike_mutual_connections(uuid, integer, integer, text) from public, anon;
grant execute on function public.get_spike_mutual_connections(uuid, integer, integer, text) to authenticated;
