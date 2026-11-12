-- Serialize profile document writes with follow/unfollow mutations.
-- Both paths take the same per-user advisory lock before touching users/{uuid}.
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

  -- Match spike_toggle_follow_v1 lock order to prevent profile edits from
  -- racing a follow toggle and restoring stale relationship JSON.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

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
revoke all on function public.spike_update_profile_v1(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.spike_update_profile_v1(jsonb,jsonb,jsonb) to authenticated;
