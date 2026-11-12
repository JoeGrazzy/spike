-- Keep Follow/Unfollow as one canonical relationship store in app_documents.users.following.
-- Profile edits must never overwrite server-managed relationship state. Relationship-state
-- reads must normalize both historical string and object-form IDs and respect both block stores.

create or replace function public.spike_update_profile_v1(
  p_profile jsonb,
  p_privacy jsonb,
  p_user_doc jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_doc public.app_documents%rowtype;
  v_data jsonb;
  v_updated timestamptz := now();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then raise exception 'Invalid profile payload'; end if;
  if p_privacy is null or jsonb_typeof(p_privacy) <> 'object' then raise exception 'Invalid privacy payload'; end if;
  if p_user_doc is null or jsonb_typeof(p_user_doc) <> 'object' then raise exception 'Invalid user document payload'; end if;
  if length(coalesce(p_profile->>'username','')) > 40
     or (length(coalesce(p_profile->>'username','')) > 0 and coalesce(p_profile->>'username','') !~ '^[A-Za-z0-9._-]{2,40}$') then
    raise exception 'Invalid username format';
  end if;
  if length(coalesce(p_profile->>'display_name','')) > 120
     or length(coalesce(p_profile->>'bio','')) > 2000
     or length(coalesce(p_profile->>'avatar_url','')) > 2048
     or length(coalesce(p_profile->>'website','')) > 2048 then
    raise exception 'Profile field exceeds the allowed length';
  end if;

  insert into public.profiles(id,username,display_name,bio,avatar_url,website,updated_at)
  values(v_uid,nullif(trim(p_profile->>'username'),''),nullif(trim(p_profile->>'display_name'),''),
         nullif(trim(p_profile->>'bio'),''),nullif(trim(p_profile->>'avatar_url'),''),
         nullif(trim(p_profile->>'website'),''),v_updated)
  on conflict(id) do update set username=excluded.username,display_name=excluded.display_name,
    bio=excluded.bio,avatar_url=excluded.avatar_url,website=excluded.website,updated_at=v_updated;

  insert into public.profile_privacy(user_id,profile_visibility,posts_visibility,media_visibility,
    friends_visibility,allow_messages,allow_calls,show_online_status,allow_profile_discovery,updated_at)
  values(v_uid,coalesce(nullif(p_privacy->>'profile_visibility',''),'public'),
    coalesce(nullif(p_privacy->>'posts_visibility',''),'public'),
    coalesce(nullif(p_privacy->>'media_visibility',''),'public'),
    coalesce(nullif(p_privacy->>'friends_visibility',''),'public'),
    coalesce(nullif(p_privacy->>'allow_messages',''),'friends'),
    coalesce(nullif(p_privacy->>'allow_calls',''),'friends'),
    coalesce((p_privacy->>'show_online_status')::boolean,true),
    coalesce((p_privacy->>'allow_profile_discovery')::boolean,true),v_updated)
  on conflict(user_id) do update set profile_visibility=excluded.profile_visibility,
    posts_visibility=excluded.posts_visibility,media_visibility=excluded.media_visibility,
    friends_visibility=excluded.friends_visibility,allow_messages=excluded.allow_messages,
    allow_calls=excluded.allow_calls,show_online_status=excluded.show_online_status,
    allow_profile_discovery=excluded.allow_profile_discovery,updated_at=v_updated;

  select * into v_doc from public.app_documents where path='users/'||v_uid::text for update;
  -- The relationship list is server-owned. Never accept it from a profile-edit payload.
  v_data := coalesce(v_doc.data,'{}'::jsonb) || (p_user_doc - 'following');
  v_data := jsonb_set(v_data,'{following}',
    case when jsonb_typeof(v_doc.data->'following')='array' then v_doc.data->'following' else '[]'::jsonb end,true);
  v_data := jsonb_set(v_data,'{id}',to_jsonb(v_uid::text),true);
  v_data := jsonb_set(v_data,'{updated_at}',to_jsonb(v_updated),true);

  if v_doc.path is null then
    insert into public.app_documents(path,parent_path,collection_name,document_id,owner_id,data,created_at,updated_at)
    values('users/'||v_uid::text,'users','users',v_uid::text,v_uid,v_data,v_updated,v_updated);
  else
    update public.app_documents set data=v_data,updated_at=v_updated where path=v_doc.path;
  end if;
  return jsonb_build_object('saved',true);
end;
$function$;

create or replace function public.get_spike_viewer_relationship(p_other_user uuid)
returns table(following boolean, friendship text, request_id uuid)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with me as (select auth.uid() uid),
  relationship_access as (
    select
      me.uid,
      p_other_user as other_id,
      (me.uid is not null and p_other_user is not null and p_other_user <> me.uid
       and public.can_discover_spike_profile(me.uid,p_other_user)
       and not exists (
         select 1 from public.private_message_blocks b
         where (b.blocker_id=me.uid and b.blocked_id=p_other_user)
            or (b.blocker_id=p_other_user and b.blocked_id=me.uid)
       )
       and not exists (
         select 1 from public.feed_blocks b
         where (b.blocker_id=me.uid and b.blocked_id=p_other_user)
            or (b.blocker_id=p_other_user and b.blocked_id=me.uid)
       )) as can_interact
    from me
  ),
  incoming as (
    select fr.id from public.friend_requests fr, relationship_access a
    where a.can_interact and fr.sender_id=a.other_id and fr.recipient_id=a.uid and fr.status='pending'
    limit 1
  ),
  outgoing as (
    select fr.id from public.friend_requests fr, relationship_access a
    where a.can_interact and fr.sender_id=a.uid and fr.recipient_id=a.other_id and fr.status='pending'
    limit 1
  ),
  friend as (
    select 1 from public.friendships f, relationship_access a
    where a.can_interact and f.user_id=a.uid and f.friend_id=a.other_id
    limit 1
  ),
  following_state as (
    select exists (
      select 1
      from public.app_documents d
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(d.data->'following')='array' then d.data->'following' else '[]'::jsonb end
      ) e(value)
      cross join relationship_access a
      where a.can_interact
        and d.path='users/'||a.uid::text
        and d.collection_name='users'
        and d.document_id=a.uid::text
        and case
          when jsonb_typeof(e.value)='string' then e.value #>> '{}'
          when jsonb_typeof(e.value)='object' then coalesce(e.value->>'id',e.value->>'user_id')
          else null
        end = a.other_id::text
    ) as is_following
  )
  select
    coalesce((select is_following from following_state),false),
    case when not a.can_interact then 'none'
         when exists(select 1 from friend) then 'friends'
         when exists(select 1 from incoming) then 'incoming'
         when exists(select 1 from outgoing) then 'outgoing'
         else 'none' end,
    case when not a.can_interact or exists(select 1 from friend) then null::uuid
         when exists(select 1 from incoming) then (select id from incoming)
         when exists(select 1 from outgoing) then (select id from outgoing)
         else null::uuid end
  from relationship_access a
  where a.uid is not null;
$function$;
