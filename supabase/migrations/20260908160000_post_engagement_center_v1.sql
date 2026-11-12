-- SPIKE Creator Engagement Center v1
-- Canonical per-user engagement events for creator-owned Signals.
create table if not exists public.post_engagement_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  actor_id uuid not null,
  post_id text not null,
  action_type text not null check (action_type in ('like','reaction','comment','share','view','save')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists post_engagement_events_owner_created_idx
  on public.post_engagement_events(owner_id, created_at desc);
create index if not exists post_engagement_events_owner_action_created_idx
  on public.post_engagement_events(owner_id, action_type, created_at desc);
create index if not exists post_engagement_events_post_created_idx
  on public.post_engagement_events(post_id, created_at desc);

alter table public.post_engagement_events enable row level security;
drop policy if exists post_engagement_events_owner_select on public.post_engagement_events;
create policy post_engagement_events_owner_select on public.post_engagement_events
  for select to authenticated using (owner_id = auth.uid());
revoke all on public.post_engagement_events from anon, authenticated;
grant select on public.post_engagement_events to authenticated;

after? 
create or replace function private.log_post_engagement(
  p_owner_id uuid,
  p_actor_id uuid,
  p_post_id text,
  p_action_type text,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if p_owner_id is null or p_actor_id is null or p_post_id is null or p_action_type not in ('like','reaction','comment','share','view','save') then
    return;
  end if;
  if p_owner_id = p_actor_id then return; end if;
  insert into public.post_engagement_events(owner_id,actor_id,post_id,action_type,metadata)
  values(p_owner_id,p_actor_id,p_post_id,p_action_type,coalesce(p_metadata,'{}'::jsonb));
end;
$$;
revoke all on function private.log_post_engagement(uuid,uuid,text,text,jsonb) from public, anon, authenticated;

grant execute on function private.log_post_engagement(uuid,uuid,text,text,jsonb) to authenticated;

create or replace function public.get_my_engagement_dashboard(
  p_days integer default 7,
  p_limit integer default 100,
  p_action text default null
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days,7),3650));
  v_limit integer := greatest(1, least(coalesce(p_limit,100),500));
  v_cutoff timestamptz := now() - make_interval(days => v_days);
  v_summary jsonb;
  v_activities jsonb;
  v_top jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_action is not null and p_action not in ('like','reaction','comment','share','view','save') then raise exception 'Invalid engagement action'; end if;

  select jsonb_build_object(
    'total', count(*),
    'likes', count(*) filter (where action_type='like'),
    'comments', count(*) filter (where action_type='comment'),
    'shares', count(*) filter (where action_type='share'),
    'views', count(*) filter (where action_type='view'),
    'reactions', count(*) filter (where action_type='reaction'),
    'saves', count(*) filter (where action_type='save')
  ) into v_summary
  from public.post_engagement_events
  where owner_id=auth.uid() and created_at>=v_cutoff and (p_action is null or action_type=p_action);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_activities
  from (
    select e.id,e.post_id,e.action_type,e.metadata,e.created_at,
      coalesce(p.display_name,p.full_name,p.username,p.email,'SPIKE user') as actor_name,
      coalesce(p.avatar_url,'') as actor_avatar,
      left(coalesce(pd.data->>'content',pd.data->>'text','Your Signal'),120) as post_title
    from public.post_engagement_events e
    left join public.profiles p on p.id=e.actor_id
    left join public.app_documents pd on pd.collection_name='posts' and pd.document_id=e.post_id
    where e.owner_id=auth.uid() and e.created_at>=v_cutoff and (p_action is null or e.action_type=p_action)
    order by e.created_at desc limit v_limit
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.engagement desc),'[]'::jsonb) into v_top
  from (
    select e.post_id,
      left(coalesce(max(pd.data->>'content'),max(pd.data->>'text'),'Your Signal'),120) as post_title,
      count(*) as engagement,
      count(*) filter (where e.action_type='view') as views,
      count(*) filter (where e.action_type='like') as likes,
      count(*) filter (where e.action_type='comment') as comments,
      count(*) filter (where e.action_type='share') as shares,
      count(*) filter (where e.action_type='save') as saves
    from public.post_engagement_events e
    left join public.app_documents pd on pd.collection_name='posts' and pd.document_id=e.post_id
    where e.owner_id=auth.uid() and e.created_at>=v_cutoff and (p_action is null or e.action_type=p_action)
    group by e.post_id order by count(*) desc limit 10
  ) x;

  return jsonb_build_object('period_days',v_days,'summary',coalesce(v_summary,'{"total":0,"likes":0,"comments":0,"shares":0,"views":0,"reactions":0,"saves":0}'::jsonb),'activities',v_activities,'top_posts',v_top);
end;
$$;
revoke all on function public.get_my_engagement_dashboard(integer,integer,text) from public, anon;
grant execute on function public.get_my_engagement_dashboard(integer,integer,text) to authenticated;

-- Patch the canonical interaction RPC so successful actor actions generate creator events.
create or replace function public.mutate_post_interaction(p_post_id text, p_action text, p_emoji text default null, p_comment jsonb default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  r public.app_documents%rowtype; u public.app_documents%rowtype; d jsonb; ud jsonb; reactions jsonb; users jsonb; comments jsonb; saved jsonb; k text; uid text := auth.uid()::text; oldk text; had_like boolean := false; had_target boolean := false; v_author uuid; v_comment_id text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into r from public.app_documents where collection_name='posts' and document_id=p_post_id for update;
  if not found or coalesce((r.data->>'deleted')::boolean,false) then raise exception 'Post not found'; end if;
  d:=coalesce(r.data,'{}'::jsonb); v_author:=nullif(d->>'authorUid','')::uuid;
  if p_action='like' then
    reactions:=case when jsonb_typeof(d->'reactions')='object' then d->'reactions' else '{}'::jsonb end;
    users:=case when jsonb_typeof(reactions->'like_users')='array' then reactions->'like_users' else '[]'::jsonb end;
    had_like:=users @> jsonb_build_array(uid);
    if had_like then users:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(users) x where x<>to_jsonb(uid)); else users:=users||jsonb_build_array(uid); end if;
    reactions:=jsonb_set(reactions,'{like_users}',users,true); reactions:=jsonb_set(reactions,'{like}',to_jsonb(jsonb_array_length(users)),true); d:=jsonb_set(d,'{reactions}',reactions,true)-'likes';
    if not had_like then perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'like','{}'::jsonb); end if;
  elsif p_action='reaction' then
    if p_emoji is null or p_emoji not in ('❤️','😂','🔥','👍','👏','😮','🚀','😍','😢','😡','🎉','💯') then raise exception 'Invalid reaction'; end if;
    reactions:=case when jsonb_typeof(d->'reactions')='object' then d->'reactions' else '{}'::jsonb end; k:=p_emoji||'_users'; users:=case when jsonb_typeof(reactions->k)='array' then reactions->k else '[]'::jsonb end; had_target:=users @> jsonb_build_array(uid);
    for oldk in select key from jsonb_each(reactions) where key like '%_users' loop
      users:=case when jsonb_typeof(reactions->oldk)='array' then reactions->oldk else '[]'::jsonb end;
      if users @> jsonb_build_array(uid) then users:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(users) x where x<>to_jsonb(uid)); reactions:=jsonb_set(reactions,array[oldk],users,true); k:=left(oldk,length(oldk)-6); reactions:=jsonb_set(reactions,array[k],to_jsonb(jsonb_array_length(users)),true); end if;
    end loop;
    k:=p_emoji||'_users'; users:=case when jsonb_typeof(reactions->k)='array' then reactions->k else '[]'::jsonb end;
    if had_target then users:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(users) x where x<>to_jsonb(uid)); else users:=users||jsonb_build_array(uid); end if;
    reactions:=jsonb_set(reactions,array[k],users,true); reactions:=jsonb_set(reactions,array[p_emoji],to_jsonb(jsonb_array_length(users)),true); d:=jsonb_set(d,'{reactions}',reactions,true);
    if not had_target then perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'reaction',jsonb_build_object('reaction',p_emoji)); end if;
  elsif p_action='comment' then
    if p_comment is null or jsonb_typeof(p_comment)<>'object' then raise exception 'Comment is required'; end if;
    comments:=case when jsonb_typeof(d->'comments')='array' then d->'comments' else '[]'::jsonb end; comments:=comments||(p_comment||jsonb_build_object('authorUid',uid)); d:=jsonb_set(d,'{comments}',comments,true); v_comment_id:=nullif(coalesce(p_comment->>'id',gen_random_uuid()::text),'');
    perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'comment',jsonb_build_object('comment_id',v_comment_id,'text',left(coalesce(p_comment->>'text',p_comment->>'content',''),5000)));
  elsif p_action='save' or p_action='unsave' then
    select * into u from public.app_documents where path='users/'||uid for update; ud:=coalesce(u.data,'{}'::jsonb); saved:=case when jsonb_typeof(ud->'savedPosts')='array' then ud->'savedPosts' else '[]'::jsonb end;
    if p_action='save' then if not (saved @> jsonb_build_array(p_post_id)) then saved:=saved||jsonb_build_array(p_post_id); end if; else saved:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(saved) x where x<>to_jsonb(p_post_id)); end if;
    ud:=jsonb_set(ud,'{savedPosts}',saved,true); if u.path is null then insert into public.app_documents(path,parent_path,collection_name,document_id,owner_id,data,created_at,updated_at) values('users/'||uid,'users','users',uid,auth.uid(),ud,now(),now()); else update public.app_documents set data=ud,updated_at=now() where path=u.path; end if;
    d:=jsonb_set(d,'{saveCount}',to_jsonb(greatest(0,coalesce((d->>'saveCount')::int,0)+case when p_action='save' then 1 else -1 end)),true); if p_action='save' then perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'save','{}'::jsonb); end if;
  elsif p_action='view' then d:=jsonb_set(d,'{views}',to_jsonb(coalesce((d->>'views')::int,0)+1),true); perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'view','{}'::jsonb);
  elsif p_action='share' then d:=jsonb_set(d,'{shareCount}',to_jsonb(coalesce((d->>'shareCount')::int,coalesce((d->>'shares')::int,0))+1),true); perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'share','{}'::jsonb);
  else raise exception 'Unsupported interaction: %',p_action; end if;
  update public.app_documents set data=d,updated_at=now() where path=r.path; return d;
end; $$;
revoke all on function public.mutate_post_interaction(text,text,text,jsonb) from public, anon;
grant execute on function public.mutate_post_interaction(text,text,text,jsonb) to authenticated;

-- Legacy RPCs used by older clients also feed the same event stream.
create or replace function public.increment_post_share_count(p_post_id text, p_count integer default 1)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_uid uuid:=auth.uid(); v_row public.app_documents; v_data jsonb; v_author uuid; v_inc integer:=greatest(1,least(coalesce(p_count,1),20));
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select * into v_row from public.app_documents where path='posts/'||p_post_id and collection_name='posts' for update;
 if not found then raise exception 'Post not found'; end if;
 v_data:=coalesce(v_row.data,'{}'::jsonb); v_author:=nullif(v_data->>'authorUid','')::uuid;
 v_data:=jsonb_set(v_data,'{shareCount}',to_jsonb(coalesce((v_data->>'shareCount')::int,coalesce((v_data->>'shares')::int,0))+v_inc),true);
 update public.app_documents set data=v_data,updated_at=now() where path=v_row.path;
 for i in 1..v_inc loop perform private.log_post_engagement(v_author,v_uid,p_post_id,'share','{}'::jsonb); end loop;
 return v_data;
end; $$;
revoke all on function public.increment_post_share_count(text,integer) from public,anon;
grant execute on function public.increment_post_share_count(text,integer) to authenticated;

create or replace function public.add_post_comment(p_post_id text, p_text text, p_parent_comment_id text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_uid uuid:=auth.uid(); v_row public.app_documents; v_data jsonb; v_comments jsonb; v_comment jsonb; v_name text; v_avatar text; v_id text:=gen_random_uuid()::text; v_author uuid;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if length(btrim(coalesce(p_text,'')))<1 or length(btrim(p_text))>5000 then raise exception 'Comment must be between 1 and 5000 characters'; end if;
 select * into v_row from public.app_documents where path='posts/'||p_post_id and collection_name='posts' for update;
 if not found then raise exception 'Post not found'; end if;
 v_data:=coalesce(v_row.data,'{}'::jsonb); v_author:=nullif(v_data->>'authorUid','')::uuid; v_comments:=case when jsonb_typeof(v_data->'comments')='array' then v_data->'comments' else '[]'::jsonb end;
 select coalesce(display_name,full_name,username,email,'User'),avatar_url into v_name,v_avatar from public.profiles where id=v_uid;
 v_comment:=jsonb_build_object('id',v_id,'postId',p_post_id,'authorUid',v_uid,'authorName',coalesce(v_name,'User'),'authorAvatar',coalesce(v_avatar,''),'text',btrim(p_text),'parentCommentId',nullif(p_parent_comment_id,''),'createdAt',now());
 insert into public.comments(id,post_id,user_id,parent_comment_id,content,created_at) values(v_id,p_post_id,v_uid,nullif(p_parent_comment_id,''),btrim(p_text),now());
 v_comments:=v_comments||jsonb_build_array(v_comment); v_data:=jsonb_set(v_data,'{comments}',v_comments,true); update public.app_documents set data=v_data,updated_at=now() where path=v_row.path;
 perform private.log_post_engagement(v_author,v_uid,p_post_id,'comment',jsonb_build_object('comment_id',v_id,'text',left(btrim(p_text),5000)));
 return jsonb_build_object('comment',v_comment,'comments',v_comments,'data',v_data);
end; $$;
revoke all on function public.add_post_comment(text,text,text) from public,anon;
grant execute on function public.add_post_comment(text,text,text) to authenticated;
