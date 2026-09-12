-- Profile/follow hardening for profile.html.
-- Keeps legacy app-document compatibility while making the critical mutations atomic.

create or replace function public.spike_toggle_follow_v1(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.app_documents%rowtype;
  v_data jsonb;
  v_following jsonb;
  v_is_following boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid follow target';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'SPIKE member not found';
  end if;

  -- Lock the caller's document so concurrent tabs/devices cannot lose updates.
  select * into v_row
  from public.app_documents
  where path = 'users/' || v_uid::text
  for update;

  v_data := coalesce(v_row.data, '{}'::jsonb);
  v_following := case
    when jsonb_typeof(v_data->'following') = 'array' then v_data->'following'
    else '[]'::jsonb
  end;

  v_is_following := v_following @> jsonb_build_array(p_target_user_id::text);
  if v_is_following then
    select coalesce(jsonb_agg(x), '[]'::jsonb)
      into v_following
    from jsonb_array_elements(v_following) x
    where x <> to_jsonb(p_target_user_id::text);
  else
    v_following := v_following || jsonb_build_array(p_target_user_id::text);
  end if;

  v_data := jsonb_set(v_data, '{following}', v_following, true);
  v_data := jsonb_set(v_data, '{id}', to_jsonb(v_uid::text), true);
  v_data := jsonb_set(v_data, '{updated_at}', to_jsonb(now()), true);

  if v_row.path is null then
    insert into public.app_documents(
      path,parent_path,collection_name,document_id,owner_id,data,created_at,updated_at
    ) values (
      'users/' || v_uid::text,'users','users',v_uid::text,v_uid,v_data,now(),now()
    );
  else
    update public.app_documents
      set data = v_data, updated_at = now()
    where path = v_row.path;
  end if;

  return jsonb_build_object('following', not v_is_following);
end;
$$;

revoke all on function public.spike_toggle_follow_v1(uuid) from public, anon;
grant execute on function public.spike_toggle_follow_v1(uuid) to authenticated;

create or replace function public.spike_update_profile_v1(
  p_profile jsonb,
  p_privacy jsonb,
  p_user_doc jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_doc public.app_documents%rowtype;
  v_data jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Invalid profile payload';
  end if;
  if p_privacy is null or jsonb_typeof(p_privacy) <> 'object' then
    raise exception 'Invalid privacy payload';
  end if;
  if p_user_doc is null or jsonb_typeof(p_user_doc) <> 'object' then
    raise exception 'Invalid user document payload';
  end if;

  -- Explicit column mapping prevents arbitrary JSON keys from becoming profile columns.
  insert into public.profiles(id,username,display_name,bio,avatar_url,website,updated_at)
  values (
    v_uid,
    nullif(p_profile->>'username',''),
    nullif(p_profile->>'display_name',''),
    nullif(p_profile->>'bio',''),
    nullif(p_profile->>'avatar_url',''),
    nullif(p_profile->>'website',''),
    coalesce(nullif(p_profile->>'updated_at','')::timestamptz, now())
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    bio = excluded.bio,
    avatar_url = excluded.avatar_url,
    website = excluded.website,
    updated_at = excluded.updated_at;

  insert into public.profile_privacy(
    user_id,profile_visibility,posts_visibility,media_visibility,friends_visibility,
    allow_messages,allow_calls,show_online_status,allow_profile_discovery,updated_at
  ) values (
    v_uid,
    coalesce(nullif(p_privacy->>'profile_visibility',''),'public'),
    coalesce(nullif(p_privacy->>'posts_visibility',''),'public'),
    coalesce(nullif(p_privacy->>'media_visibility',''),'public'),
    coalesce(nullif(p_privacy->>'friends_visibility',''),'public'),
    coalesce(nullif(p_privacy->>'allow_messages',''),'friends'),
    coalesce(nullif(p_privacy->>'allow_calls',''),'friends'),
    coalesce((p_privacy->>'show_online_status')::boolean,true),
    coalesce((p_privacy->>'allow_profile_discovery')::boolean,true),
    coalesce(nullif(p_privacy->>'updated_at','')::timestamptz, now())
  )
  on conflict (user_id) do update set
    profile_visibility = excluded.profile_visibility,
    posts_visibility = excluded.posts_visibility,
    media_visibility = excluded.media_visibility,
    friends_visibility = excluded.friends_visibility,
    allow_messages = excluded.allow_messages,
    allow_calls = excluded.allow_calls,
    show_online_status = excluded.show_online_status,
    allow_profile_discovery = excluded.allow_profile_discovery,
    updated_at = excluded.updated_at;

  -- Lock and merge the legacy document so unrelated keys are preserved.
  select * into v_doc
  from public.app_documents
  where path = 'users/' || v_uid::text
  for update;

  v_data := coalesce(v_doc.data, '{}'::jsonb) || p_user_doc;
  v_data := jsonb_set(v_data, '{id}', to_jsonb(v_uid::text), true);
  v_data := jsonb_set(v_data, '{updated_at}', to_jsonb(now()), true);

  if v_doc.path is null then
    insert into public.app_documents(
      path,parent_path,collection_name,document_id,owner_id,data,created_at,updated_at
    ) values (
      'users/' || v_uid::text,'users','users',v_uid::text,v_uid,v_data,now(),now()
    );
  else
    update public.app_documents
      set data = v_data, updated_at = now()
    where path = v_doc.path;
  end if;

  return jsonb_build_object('saved', true);
end;
$$;

revoke all on function public.spike_update_profile_v1(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.spike_update_profile_v1(jsonb,jsonb,jsonb) to authenticated;
