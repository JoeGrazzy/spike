-- SPIKE social relationship consistency v6.
-- Repairs legacy canonical users/{uuid} documents that have a NULL owner_id,
-- keeps Follow and Friend Request systems distinct, and makes blocking clean
-- both follow edges and pending friend requests.


-- Canonical path + UUID document_id + existing auth user is sufficient to
-- safely restore the missing owner reference for legacy user documents.
update public.app_documents d
   set owner_id = d.document_id::uuid,
       updated_at = coalesce(d.updated_at, now())
 where d.collection_name = 'users'
   and d.owner_id is null
   and d.path = 'users/' || d.document_id
   and d.document_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and exists (select 1 from auth.users u where u.id = d.document_id::uuid);

-- The prior partial GIN index excluded the legacy rows above when owner_id
-- was NULL. Keep the index aligned with the canonical document lookup.
drop index if exists public.app_documents_users_following_gin_idx;
create index if not exists app_documents_users_following_gin_v2_idx
  on public.app_documents using gin ((data->'following') jsonb_path_ops)
  where collection_name = 'users' and data ? 'following';

create or replace function public.spike_toggle_follow_v1(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.app_documents%rowtype;
  v_data jsonb;
  v_following jsonb;
  v_is_following boolean;
  v_target_text text := p_target_user_id::text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid follow target';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select * into v_row
    from public.app_documents
   where path = 'users/' || v_uid::text
     and collection_name = 'users'
     and document_id = v_uid::text
   for update;

  if found and v_row.owner_id is not null and v_row.owner_id <> v_uid then
    raise exception 'Profile document ownership mismatch' using errcode = '42501';
  end if;

  v_data := coalesce(v_row.data, '{}'::jsonb);
  v_following := case when jsonb_typeof(v_data->'following') = 'array'
                      then v_data->'following' else '[]'::jsonb end;

  v_is_following := exists (
    select 1
      from jsonb_array_elements(v_following) e(value)
     where case
       when jsonb_typeof(e.value) = 'string' then e.value #>> '{}'
       when jsonb_typeof(e.value) = 'object' then coalesce(e.value->>'id', e.value->>'user_id')
       else null
     end = v_target_text
  );

  if v_is_following then
    select coalesce(jsonb_agg(e.value order by e.ordinality), '[]'::jsonb)
      into v_following
      from jsonb_array_elements(v_following) with ordinality e(value, ordinality)
     where case
       when jsonb_typeof(e.value) = 'string' then e.value #>> '{}'
       when jsonb_typeof(e.value) = 'object' then coalesce(e.value->>'id', e.value->>'user_id')
       else null
     end is distinct from v_target_text;
  else
    if not exists (select 1 from public.profiles where id = p_target_user_id) then
      raise exception 'SPIKE member not found';
    end if;
    if not public.can_discover_spike_profile(v_uid, p_target_user_id) then
      raise exception 'This profile is not available to follow' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.private_message_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_target_user_id)
          or (b.blocker_id = p_target_user_id and b.blocked_id = v_uid)
    ) or exists (
      select 1 from public.feed_blocks b
       where (b.blocker_id = v_uid and b.blocked_id = p_target_user_id)
          or (b.blocker_id = p_target_user_id and b.blocked_id = v_uid)
    ) then
      raise exception 'Following is unavailable for this member' using errcode = '42501';
    end if;
    v_following := v_following || jsonb_build_array(v_target_text);
  end if;

  v_data := jsonb_set(v_data, '{following}', v_following, true);
  v_data := jsonb_set(v_data, '{id}', to_jsonb(v_uid::text), true);
  v_data := jsonb_set(v_data, '{updated_at}', to_jsonb(now()), true);

  if v_row.path is null then
    insert into public.app_documents
      (path, parent_path, collection_name, document_id, owner_id, data, created_at, updated_at)
    values
      ('users/' || v_uid::text, 'users', 'users', v_uid::text, v_uid, v_data, now(), now());
  else
    update public.app_documents
       set data = v_data,
           owner_id = coalesce(owner_id, v_uid),
           updated_at = now()
     where path = v_row.path;
  end if;

  return jsonb_build_object('following', not v_is_following);
end;
$function$;

revoke all on function public.spike_toggle_follow_v1(uuid) from public, anon;
grant execute on function public.spike_toggle_follow_v1(uuid) to authenticated;



-- Counts use the same identity and visibility rules as the list RPC. For the
-- owner, stale UUID references remain countable until the owner removes them
-- from Following; this keeps the displayed count aligned with removable rows.
create or replace function public.get_spike_profile_follow_counts(p_owner uuid)
returns table(followers_count bigint, following_count bigint)
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $function$
  with owner_doc as (
    select coalesce(data->'following', '[]'::jsonb) as following
      from public.app_documents
     where collection_name = 'users'
       and document_id = p_owner::text
       and path = 'users/' || p_owner::text
     limit 1
  ), counts as (
    select
      (select count(distinct coalesce(d.owner_id::text, d.document_id))::bigint
         from public.app_documents d
         left join public.profiles p on p.id::text = coalesce(d.owner_id::text, d.document_id)
        where d.collection_name = 'users'
          and d.path = 'users/' || d.document_id
          and d.document_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and (d.owner_id is null or d.owner_id <> p_owner)
          and (d.data->'following' @> jsonb_build_array(p_owner::text)
            or d.data->'following' @> jsonb_build_array(jsonb_build_object('id', p_owner::text))
            or d.data->'following' @> jsonb_build_array(jsonb_build_object('user_id', p_owner::text)))
          and (auth.uid() = p_owner or (p.id is not null and public.can_discover_spike_profile(auth.uid(), p.id)))) as followers_count,
      (select count(distinct f.user_id)::bigint
         from owner_doc o
         cross join lateral (
           select case
             when jsonb_typeof(x.value) = 'string' then x.value #>> '{}'
             when jsonb_typeof(x.value) = 'object' then coalesce(x.value->>'id', x.value->>'user_id')
             else null
           end as user_id
           from jsonb_array_elements(case when jsonb_typeof(o.following) = 'array' then o.following else '[]'::jsonb end) x(value)
         ) f
         left join public.profiles p on p.id::text = f.user_id
        where f.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and (auth.uid() = p_owner or (p.id is not null and public.can_discover_spike_profile(auth.uid(), p.id)))) as following_count
  )
  select
    case when public.can_view_spike_friends(auth.uid(), p_owner) then counts.followers_count else 0 end,
    case when public.can_view_spike_friends(auth.uid(), p_owner) then counts.following_count else 0 end
  from counts;
$function$;

revoke all on function public.get_spike_profile_follow_counts(uuid) from public, anon;
grant execute on function public.get_spike_profile_follow_counts(uuid) to authenticated;

create or replace function public.dm_block_user(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_first uuid;
  v_second uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_other_user_id is null or p_other_user_id = v_uid then
    raise exception 'Invalid user';
  end if;
  if not exists (select 1 from auth.users where id = p_other_user_id) then
    raise exception 'SPIKE member not found';
  end if;

  v_first := least(v_uid::text, p_other_user_id::text)::uuid;
  v_second := greatest(v_uid::text, p_other_user_id::text)::uuid;
  perform pg_advisory_xact_lock(hashtextextended(v_first::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_second::text, 0));

  insert into public.private_message_blocks(blocker_id, blocked_id)
  values (v_uid, p_other_user_id)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.friendships
   where (user_id = v_uid and friend_id = p_other_user_id)
      or (user_id = p_other_user_id and friend_id = v_uid);

  -- Remove both directions of Follow even when a legacy user document had
  -- owner_id NULL. The canonical path/document_id pair identifies its owner.
  update public.app_documents d
     set data = jsonb_set(
           coalesce(d.data, '{}'::jsonb),
           '{following}',
           (select coalesce(jsonb_agg(x.value order by x.ordinality), '[]'::jsonb)
              from jsonb_array_elements(
                case when jsonb_typeof(d.data->'following') = 'array'
                     then d.data->'following' else '[]'::jsonb end
              ) with ordinality as x(value, ordinality)
             where case
               when jsonb_typeof(x.value) = 'string' then x.value #>> '{}'
               when jsonb_typeof(x.value) = 'object' then coalesce(x.value->>'id', x.value->>'user_id')
               else null
             end is distinct from case
               when d.document_id = v_uid::text then p_other_user_id::text
               else v_uid::text
             end),
           true),
         owner_id = coalesce(d.owner_id, d.document_id::uuid),
         updated_at = now()
   where d.collection_name = 'users'
     and d.document_id in (v_uid::text, p_other_user_id::text)
     and d.path = 'users/' || d.document_id
     and (d.owner_id is null or d.owner_id::text = d.document_id);

  -- A block also cancels pending friend requests. Remove their associated
  -- inbox notifications so a blocked request cannot remain actionable.
  with removed_requests as (
    delete from public.friend_requests
     where status = 'pending'
       and ((sender_id = v_uid and recipient_id = p_other_user_id)
         or (sender_id = p_other_user_id and recipient_id = v_uid))
    returning id, sender_id, recipient_id
  )
  delete from public.notifications n
   using removed_requests r
   where n.type = 'friend_request'
     and n.data->>'request_id' = r.id::text
     and n.user_id in (r.sender_id, r.recipient_id);
end;
$function$;

revoke all on function public.dm_block_user(uuid) from public, anon;
grant execute on function public.dm_block_user(uuid) to authenticated;

create or replace function public.get_friend_requests()
returns table(
  request_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $function$
  select fr.id, fr.sender_id, p.username, p.display_name, p.avatar_url, p.bio, fr.created_at
    from public.friend_requests fr
    left join public.profiles p on p.id = fr.sender_id
   where fr.recipient_id = auth.uid()
     and fr.status = 'pending'
     and not exists (
       select 1 from public.private_message_blocks b
        where (b.blocker_id = fr.sender_id and b.blocked_id = fr.recipient_id)
           or (b.blocker_id = fr.recipient_id and b.blocked_id = fr.sender_id)
     )
   order by fr.created_at desc;
$function$;

revoke all on function public.get_friend_requests() from public, anon;
grant execute on function public.get_friend_requests() to authenticated;

