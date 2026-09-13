-- Profile mutation hardening: make follow and profile saves atomic and server-authorized.

create or replace function public.toggle_spike_follow(p_target_user_id uuid)
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
  v_following_now boolean;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid follow target';
  end if;

  if not exists (select 1 from public.profiles p where p.id=p_target_user_id) then
    raise exception 'SPIKE member not found';
  end if;

  select * into v_row
  from public.app_documents
  where path='users/'||v_uid::text
  for update;

  v_data := coalesce(v_row.data,'{}'::jsonb);
  v_following := case
    when jsonb_typeof(v_data->'following')='array' then v_data->'following'
    else '[]'::jsonb
  end;

  if v_following @> jsonb_build_array(p_target_user_id::text) then
    v_following := (
      select coalesce(jsonb_agg(x.value order by x.ord),'[]'::jsonb)
      from jsonb_array_elements_text(v_following) with ordinality x(value,ord)
      where x.value <> p_target_user_id::text
    );
    v_following_now := false;
  else
    v_following := v_following || jsonb_build_array(p_target_user_id::text);
    v_following_now := true;
  end if;

  v_data := jsonb_set(v_data,'{following}',v_following,true);

  if v_row.path is null then
    insert into public.app_documents(path,parent_path,collection_name,document_id,owner_id,data,created_at,updated_at)
    values('users/'||v_uid::text,'users','users',v_uid::text,v_uid,v_data,now(),now());
  else
    update public.app_documents
      set data=v_data, updated_at=now()
    where path=v_row.path;
  end if;

  return jsonb_build_object('following',v_following_now);
end;
$$;

revoke execute on function public.toggle_spike_follow(uuid) from public, anon;
grant execute on function public.toggle_spike_follow(uuid) to authenticated;

create or replace function public.save_spike_profile(
  p_username text,
  p_display_name text,
  p_bio text,
  p_avatar_url text,
  p_cover_url text,
  p_website text,
  p_location text,
  p_social_links text,
  p_privacy jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.app_documents%rowtype;
  v_data jsonb;
  v_username text := regexp_replace(trim(coalesce(p_username,'')),'^@','');
  v_display_name text := trim(coalesce(p_display_name,''));
  v_bio text := trim(coalesce(p_bio,''));
  v_avatar text := trim(coalesce(p_avatar_url,''));
  v_cover text := trim(coalesce(p_cover_url,''));
  v_website text := trim(coalesce(p_website,''));
  v_location text := trim(coalesce(p_location,''));
  v_social text := trim(coalesce(p_social_links,''));
  v_privacy jsonb := coalesce(p_privacy,'{}'::jsonb);
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(v_username)>0 and v_username !~ '^[A-Za-z0-9._-]{2,40}$' then
    raise exception 'Invalid username format';
  end if;
  if p_expected_updated_at is not null then
    if not exists (select 1 from public.profiles p where p.id=v_uid and p.updated_at=p_expected_updated_at) then
      raise exception 'Profile changed elsewhere. Reload and try again.';
    end if;
  end if;
  if length(v_display_name)>120 or length(v_bio)>2000 or length(v_avatar)>2048 or length(v_cover)>2048
     or length(v_website)>2048 or length(v_location)>200 or length(v_social)>4000 then
    raise exception 'Profile field exceeds the allowed length';
  end if;

  -- One transaction: either all three representations update or none do.
  insert into public.profiles(id,username,display_name,bio,avatar_url,website,updated_at)
  values(v_uid,nullif(v_username,''),v_display_name,v_bio,v_avatar,v_website,now())
  on conflict(id) do update set
    username=excluded.username,
    display_name=excluded.display_name,
    bio=excluded.bio,
    avatar_url=excluded.avatar_url,
    website=excluded.website,
    updated_at=now();

  insert into public.profile_privacy(
    user_id,profile_visibility,posts_visibility,media_visibility,friends_visibility,
    allow_messages,allow_calls,show_online_status,allow_profile_discovery,updated_at
  ) values (
    v_uid,
    coalesce(v_privacy->>'profile_visibility','public'),
    coalesce(v_privacy->>'posts_visibility','public'),
    coalesce(v_privacy->>'media_visibility','public'),
    coalesce(v_privacy->>'friends_visibility','public'),
    coalesce(v_privacy->>'allow_messages','friends'),
    coalesce(v_privacy->>'allow_calls','friends'),
    coalesce((v_privacy->>'show_online_status')::boolean,true),
    coalesce((v_privacy->>'allow_profile_discovery')::boolean,true),
    now()
  )
  on conflict(user_id) do update set
    profile_visibility=excluded.profile_visibility,
    posts_visibility=excluded.posts_visibility,
    media_visibility=excluded.media_visibility,
    friends_visibility=excluded.friends_visibility,
    allow_messages=excluded.allow_messages,
    allow_calls=excluded.allow_calls,
    show_online_status=excluded.show_online_status,
    allow_profile_discovery=excluded.allow_profile_discovery,
    updated_at=now();

  select * into v_old
  from public.app_documents
  where path='users/'||v_uid::text
  for update;

  v_data := coalesce(v_old.data,'{}'::jsonb);
  v_data := v_data || jsonb_build_object(
    'id',v_uid,
    'display_name',v_display_name,
    'username',v_username,
    'bio',v_bio,
    'avatar_url',v_avatar,
    'cover_url',v_cover,
    'website',v_website,
    'location',v_location,
    'social_links',v_social,
    'profile_visibility',coalesce(v_privacy->>'profile_visibility','public'),
    'updated_at',now()
  );

  if v_old.path is null then
    insert into public.app_documents(path,parent_path,collection_name,document_id,owner_id,data,created_at,updated_at)
    values('users/'||v_uid::text,'users','users',v_uid::text,v_uid,v_data,now(),now());
  else
    update public.app_documents set data=v_data,updated_at=now() where path=v_old.path;
  end if;

  return jsonb_build_object('ok',true,'user_id',v_uid);
end;
$$;

revoke execute on function public.save_spike_profile(text,text,text,text,text,text,text,text,jsonb,timestamptz) from public, anon;
grant execute on function public.save_spike_profile(text,text,text,text,text,text,text,text,jsonb,timestamptz) to authenticated;
