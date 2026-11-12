-- SPIKE profile social lists v1
-- Indexed, privacy-aware, server-paginated followers/following/blocked lists.
-- Follow state remains stored in the existing users/{uid}.following document.

create index if not exists app_documents_users_following_gin_idx
  on public.app_documents using gin ((data->'following') jsonb_path_ops)
  where collection_name='users' and owner_id is not null;

create or replace function public.get_spike_profile_social_list(
  p_owner uuid,
  p_kind text,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(id uuid, display_name text, username text, avatar_url text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit,30),50));
  v_offset integer := greatest(0, coalesce(p_offset,0));
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
    select
      case
        when jsonb_typeof(x.value)='string' then x.value #>> '{}'
        when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id')
        else null
      end as user_id,
      x.ordinality as sort_order
    from public.app_documents d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.data->'following')='array' then d.data->'following' else '[]'::jsonb end
    ) with ordinality as x(value,ordinality)
    where p_kind='following'
      and d.path='users/'||p_owner::text
      and d.collection_name='users'
      and d.owner_id=p_owner

    union all

    select d.owner_id::text, 0::bigint
    from public.app_documents d
    where p_kind='followers'
      and d.collection_name='users'
      and d.owner_id is not null
      and d.owner_id<>p_owner
      and (
        d.data->'following' @> jsonb_build_array(p_owner::text)
        or d.data->'following' @> jsonb_build_array(jsonb_build_object('id',p_owner::text))
        or d.data->'following' @> jsonb_build_array(jsonb_build_object('user_id',p_owner::text))
      )

    union all

    select b.blocked_id::text, 0::bigint
    from public.private_message_blocks b
    where p_kind='blocked' and b.blocker_id=v_uid
  ),
  visible as (
    select p.id,p.display_name,p.username,p.avatar_url,
           min(t.sort_order) as sort_order
    from target_ids t
    join public.profiles p on p.id::text=t.user_id
    where p.id<>p_owner
      and (
        p_kind='blocked'
        or (
          public.can_discover_spike_profile(v_uid,p.id)
          and not exists (
            select 1 from public.private_message_blocks b
            where (b.blocker_id=v_uid and b.blocked_id=p.id)
               or (b.blocker_id=p.id and b.blocked_id=v_uid)
          )
        )
      )
    group by p.id,p.display_name,p.username,p.avatar_url
  )
  select v.id,v.display_name,v.username,v.avatar_url
  from visible v
  order by v.sort_order asc, v.id
  limit v_limit offset v_offset;
end;
$function$;

revoke all on function public.get_spike_profile_social_list(uuid,text,integer,integer) from public, anon;
grant execute on function public.get_spike_profile_social_list(uuid,text,integer,integer) to authenticated;

create or replace function public.get_spike_profile_follow_counts(p_owner uuid)
returns table(followers_count bigint, following_count bigint)
language sql
stable
security definer
set search_path to 'pg_catalog','public'
as $function$
  with owner_doc as (
    select coalesce(data->'following','[]'::jsonb) as following
    from public.app_documents
    where collection_name='users'
      and document_id=p_owner::text
      and path='users/'||p_owner::text
      and owner_id=p_owner
    limit 1
  ),
  counts as (
    select
      (
        select count(*)::bigint
        from public.app_documents d
        where d.collection_name='users'
          and d.path='users/'||d.owner_id::text
          and d.document_id=d.owner_id::text
          and d.owner_id is not null
          and d.owner_id<>p_owner
          and exists(select 1 from public.profiles p where p.id=d.owner_id)
          and (
            d.data->'following' @> jsonb_build_array(p_owner::text)
            or d.data->'following' @> jsonb_build_array(jsonb_build_object('id',p_owner::text))
            or d.data->'following' @> jsonb_build_array(jsonb_build_object('user_id',p_owner::text))
          )
          and public.can_discover_spike_profile((select auth.uid()),d.owner_id)
      ) as followers_count,
      (
        select count(distinct case
          when jsonb_typeof(x.value)='string' then x.value #>> '{}'
          when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id')
          else null
        end)::bigint
        from owner_doc o
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(o.following)='array' then o.following else '[]'::jsonb end
        ) x(value)
        join public.profiles p on p.id::text=case
          when jsonb_typeof(x.value)='string' then x.value #>> '{}'
          when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id')
          else null
        end
        where p.id<>p_owner
          and public.can_discover_spike_profile((select auth.uid()),p.id)
      ) as following_count
  )
  select
    case when public.can_view_spike_friends((select auth.uid()),p_owner) then counts.followers_count else 0 end,
    case when public.can_view_spike_friends((select auth.uid()),p_owner) then counts.following_count else 0 end
  from counts;
$function$;

revoke all on function public.get_spike_profile_follow_counts(uuid) from public, anon;
grant execute on function public.get_spike_profile_follow_counts(uuid) to authenticated;
