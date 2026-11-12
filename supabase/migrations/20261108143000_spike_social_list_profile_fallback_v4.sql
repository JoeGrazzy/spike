-- SPIKE profile social-list consistency fix.
-- The app stores user documents in app_documents; some historical accounts
-- have a users/{uuid} document but no corresponding public.profiles row.
-- Preserve those valid follow IDs in the owner's own Following list, using
-- their stored avatar and an explicit "Profile not synced" label.

create or replace function public.get_spike_profile_social_list(
  p_owner uuid, p_kind text, p_limit integer default 30, p_offset integer default 0
)
returns table(id uuid, display_name text, username text, avatar_url text)
language plpgsql stable security definer
set search_path to 'pg_catalog','public','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,30),50));
  v_offset integer := greatest(0,coalesce(p_offset,0));
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_owner is null or p_kind not in ('followers','following','blocked') then raise exception 'Invalid social list request'; end if;
  if p_kind='blocked' then
    if p_owner is distinct from v_uid then raise exception 'You can only view your own blocked list' using errcode='42501'; end if;
  elsif not public.can_view_spike_friends(v_uid,p_owner) then
    raise exception 'This member has chosen to keep their connections private' using errcode='42501';
  end if;
  return query
  with target_ids as (
    select case when jsonb_typeof(x.value)='string' then x.value #>> '{}'
      when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id') end user_id,
      x.ordinality sort_order
    from public.app_documents d
    cross join lateral jsonb_array_elements(case when jsonb_typeof(d.data->'following')='array' then d.data->'following' else '[]'::jsonb end)
      with ordinality x(value,ordinality)
    where p_kind='following' and d.collection_name='users'
      and d.document_id=p_owner::text and d.path='users/'||p_owner::text
    union all
    select d.owner_id::text,0::bigint from public.app_documents d
    where p_kind='followers' and d.collection_name='users' and d.owner_id is not null and d.owner_id<>p_owner
      and (d.data->'following' @> jsonb_build_array(p_owner::text)
        or d.data->'following' @> jsonb_build_array(jsonb_build_object('id',p_owner::text))
        or d.data->'following' @> jsonb_build_array(jsonb_build_object('user_id',p_owner::text)))
    union all
    select b.blocked_id::text,0::bigint from public.private_message_blocks b
    where p_kind='blocked' and b.blocker_id=v_uid
  ), valid_ids as (
    select t.user_id,min(t.sort_order) sort_order from target_ids t
    where t.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    group by t.user_id
  ), visible as (
    select v.user_id::uuid id,
      coalesce(nullif(p.display_name,''),nullif(p.full_name,''),nullif(p.username,''),
        nullif(d.data->>'display_name',''),nullif(d.data->>'full_name',''),nullif(d.data->>'username',''),
        'Profile not synced') display_name,
      case when p.id is null then '__profile_missing__'
        else coalesce(nullif(p.username,''),nullif(d.data->>'username','')) end username,
      coalesce(nullif(p.avatar_url,''),nullif(d.data->>'avatar_url','')) avatar_url,v.sort_order
    from valid_ids v
    left join public.profiles p on p.id::text=v.user_id
    left join public.app_documents d on d.collection_name='users'
      and d.document_id=v.user_id and d.path='users/'||v.user_id
    where v.user_id<>p_owner::text and (
      p_kind='blocked' or p_owner=v_uid or (
        p.id is not null and public.can_discover_spike_profile(v_uid,p.id)
        and not exists(select 1 from public.private_message_blocks b
          where (b.blocker_id=v_uid and b.blocked_id=p.id)
             or (b.blocker_id=p.id and b.blocked_id=v_uid))
      )
    )
  )
  select v.id,v.display_name,v.username,v.avatar_url from visible v
  order by v.sort_order,v.id limit v_limit offset v_offset;
end;
$function$;
revoke all on function public.get_spike_profile_social_list(uuid,text,integer,integer) from public,anon;
grant execute on function public.get_spike_profile_social_list(uuid,text,integer,integer) to authenticated;

-- Counts include a referenced users/{uuid} document even when the legacy
-- public.profiles projection has not yet been created, for the owner only.
create or replace function public.get_spike_profile_follow_counts(p_owner uuid)
returns table(followers_count bigint, following_count bigint)
language sql stable security definer
set search_path to 'pg_catalog','public'
as $function$
with owner_doc as (
  select coalesce(data->'following','[]'::jsonb) as following
  from public.app_documents where collection_name='users'
    and document_id=p_owner::text and path='users/'||p_owner::text limit 1
), counts as (
  select
    (select count(*)::bigint from public.app_documents d
      where d.collection_name='users' and d.path='users/'||d.owner_id::text
        and d.document_id=d.owner_id::text and d.owner_id is not null and d.owner_id<>p_owner
        and exists(select 1 from public.profiles p where p.id=d.owner_id)
        and (d.data->'following' @> jsonb_build_array(p_owner::text)
          or d.data->'following' @> jsonb_build_array(jsonb_build_object('id',p_owner::text))
          or d.data->'following' @> jsonb_build_array(jsonb_build_object('user_id',p_owner::text)))
        and public.can_discover_spike_profile(auth.uid(),d.owner_id)) as followers_count,
    (select count(distinct case when jsonb_typeof(x.value)='string' then x.value #>> '{}'
      when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id') end)::bigint
      from owner_doc o cross join lateral jsonb_array_elements(
        case when jsonb_typeof(o.following)='array' then o.following else '[]'::jsonb end) x(value)
      where (auth.uid()=p_owner and (
        exists(select 1 from public.profiles p where p.id::text=case when jsonb_typeof(x.value)='string' then x.value #>> '{}'
          when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id') end)
        or exists(select 1 from public.app_documents d where d.collection_name='users'
          and d.document_id=case when jsonb_typeof(x.value)='string' then x.value #>> '{}'
            when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id') end)
      )) or (auth.uid() is distinct from p_owner and exists(
        select 1 from public.profiles p where p.id::text=case when jsonb_typeof(x.value)='string' then x.value #>> '{}'
          when jsonb_typeof(x.value)='object' then coalesce(x.value->>'id',x.value->>'user_id') end
          and public.can_discover_spike_profile(auth.uid(),p.id)
      ))
    ) as following_count
)
select case when public.can_view_spike_friends(auth.uid(),p_owner) then counts.followers_count else 0 end,
       case when public.can_view_spike_friends(auth.uid(),p_owner) then counts.following_count else 0 end
from counts;
$function$;
revoke all on function public.get_spike_profile_follow_counts(uuid) from public,anon;
grant execute on function public.get_spike_profile_follow_counts(uuid) to authenticated;
