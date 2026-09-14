-- SPIKE Notifications Activity Center v2
-- Unifies notification emission for legacy interaction RPCs and follow/repost/purchase paths.

create or replace function private.trg_friendship_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor text;
  k text;
begin
  -- Only the friendship row that points from the original requester to the accepter
  -- represents an accepted friend request. This avoids the previous backwards alert
  -- caused by the symmetric friendship row.
  if not exists (
    select 1 from public.friend_requests fr
    where fr.sender_id = new.friend_id
      and fr.recipient_id = new.user_id
      and fr.status = 'accepted'
  ) then
    return new;
  end if;

  k := 'friend-accepted:' || new.friend_id::text || ':' || new.user_id::text;
  select coalesce(display_name,username,'Someone') into actor
  from public.profiles where id = new.user_id;

  perform private.emit_notification(
    new.friend_id,
    'friend_accepted',
    jsonb_build_object(
      'actor_id',new.user_id,
      'actor_name',actor,
      'title','Friend request accepted',
      'body',coalesce(actor,'Someone') || ' accepted your friend request'
    ),
    'normal',k,
    'friendship:' || least(new.user_id::text,new.friend_id::text) || ':' || greatest(new.user_id::text,new.friend_id::text),
    null
  );
  return new;
end;
$$;

create or replace function private.trg_user_follow_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  followed uuid;
  actor text;
  old_following jsonb := case when tg_op='UPDATE' then coalesce(old.data->'following','[]'::jsonb) else '[]'::jsonb end;
  new_following jsonb := coalesce(new.data->'following','[]'::jsonb);
begin
  if new.collection_name <> 'users' then return new; end if;
  if tg_op='UPDATE' and new_following = old_following then return new; end if;
  if tg_op='INSERT' and jsonb_typeof(new_following) <> 'array' then return new; end if;

  select coalesce(display_name,username,'Someone') into actor
  from public.profiles where id = new.owner_id;
  if actor is null then
    select coalesce(display_name,username,'Someone') into actor
    from public.profiles where id = nullif(new.document_id,'')::uuid;
  end if;

  for followed in
    select value::uuid
    from jsonb_array_elements_text(new_following) as x(value)
    where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and not (old_following @> jsonb_build_array(value))
  loop
    if followed is not null and followed <> coalesce(new.owner_id, nullif(new.document_id,'')::uuid) then
      perform private.emit_notification(
        followed,
        'follow',
        jsonb_build_object(
          'actor_id',coalesce(new.owner_id, nullif(new.document_id,'')::uuid),
          'actor_name',coalesce(actor,'Someone'),
          'title','New follower',
          'body',coalesce(actor,'Someone') || ' started following you'
        ),
        'normal',
        'follow:' || coalesce(new.owner_id, nullif(new.document_id,'')::uuid)::text || ':' || followed::text || ':' || md5(new.updated_at::text || ':' || followed::text),
        'follow:' || followed::text,
        null
      );
    end if;
  end loop;
  return new;
exception when invalid_text_representation then
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_spike_user_follow_notifications ON public.app_documents;
CREATE TRIGGER trg_spike_user_follow_notifications
AFTER INSERT OR UPDATE OF data ON public.app_documents
FOR EACH ROW EXECUTE FUNCTION private.trg_user_follow_notifications();

create or replace function private.trg_post_repost_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  original_id text;
  original_owner uuid;
  actor_uid uuid;
  actor text;
begin
  if new.collection_name <> 'posts' then return new; end if;
  original_id := nullif(coalesce(new.data->>'repostOf',new.data->>'repost_of'),'');
  actor_uid := coalesce(new.owner_id, nullif(new.data->>'authorUid','')::uuid);
  if original_id is null then return new; end if;
  select nullif(data->>'authorUid','')::uuid into original_owner
  from public.app_documents
  where collection_name='posts' and document_id=original_id
  limit 1;
  if original_owner is null or actor_uid is null or original_owner = actor_uid then return new; end if;
  select coalesce(display_name,username,'Someone') into actor from public.profiles where id=actor_uid;
  perform private.emit_notification(
    original_owner,
    'post_repost',
    jsonb_build_object('actor_id',actor_uid,'actor_name',actor,'post_id',original_id,'repost_id',new.document_id,'title','Your post was reposted','body',coalesce(actor,'Someone') || ' reposted your post'),
    'normal',
    'post-repost:' || new.document_id::text,
    'post:' || original_id || ':reposts',
    null
  );
  return new;
end;
$$;
DROP TRIGGER IF EXISTS trg_spike_post_repost_notification ON public.app_documents;
CREATE TRIGGER trg_spike_post_repost_notification
AFTER INSERT ON public.app_documents
FOR EACH ROW EXECUTE FUNCTION private.trg_post_repost_notification();

create or replace function private.trg_room_purchase_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op='INSERT' then
    perform private.emit_notification(
      new.user_id,
      'room_purchase_submitted',
      jsonb_build_object('room_id',new.room_id,'item_id',new.item_id,'item_name',new.item_name,'purchase_id',new.id,'status',new.status,'title','Purchase request submitted','body','Your Room purchase request is waiting for verification'),
      'normal','room-purchase-submitted:'||new.id::text,null,null
    );
  elsif tg_op='UPDATE' and old.status is distinct from new.status and new.status in ('approved','verified','rejected','failed') then
    perform private.emit_notification(
      new.user_id,
      case when new.status in ('approved','verified') then 'room_purchase_verified' else 'room_purchase_rejected' end,
      jsonb_build_object('room_id',new.room_id,'item_id',new.item_id,'item_name',new.item_name,'purchase_id',new.id,'status',new.status,'body',coalesce(new.admin_note,''),'title',case when new.status in ('approved','verified') then 'Purchase approved' else 'Purchase rejected' end),
      'high','room-purchase:'||new.id::text||':'||new.status,null,null
    );
  end if;
  return new;
end;
$$;
DROP TRIGGER IF EXISTS trg_spike_room_purchase_notifications ON public.room_purchase_requests;
CREATE TRIGGER trg_spike_room_purchase_notifications
AFTER INSERT OR UPDATE OF status ON public.room_purchase_requests
FOR EACH ROW EXECUTE FUNCTION private.trg_room_purchase_notification();

create or replace function public.mutate_post_interaction(p_post_id text, p_action text, p_emoji text default null, p_comment jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.app_documents%rowtype;
  u public.app_documents%rowtype;
  d jsonb;
  ud jsonb;
  reactions jsonb;
  users jsonb;
  comments jsonb;
  saved jsonb;
  k text;
  uid text := auth.uid()::text;
  oldk text;
  had_like boolean := false;
  had_target boolean := false;
  v_author uuid;
  v_comment_id text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into r from public.app_documents
   where collection_name='posts' and document_id=p_post_id
   for update;
  if not found or coalesce((r.data->>'deleted')::boolean,false) then raise exception 'Post not found'; end if;
  d := coalesce(r.data,'{}'::jsonb);
  v_author := nullif(d->>'authorUid','')::uuid;

  if p_action='like' then
    reactions := case when jsonb_typeof(d->'reactions')='object' then d->'reactions' else '{}'::jsonb end;
    users := case when jsonb_typeof(reactions->'like_users')='array' then reactions->'like_users' else '[]'::jsonb end;
    had_like := users @> jsonb_build_array(uid);
    if had_like then
      users := (select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(users) x where x <> to_jsonb(uid));
    else
      users := users || jsonb_build_array(uid);
    end if;
    reactions := jsonb_set(reactions,'{like_users}',users,true);
    reactions := jsonb_set(reactions,'{like}',to_jsonb(jsonb_array_length(users)),true);
    d := jsonb_set(d,'{reactions}',reactions,true) - 'likes';
    if not had_like and v_author is not null and v_author <> auth.uid() then
      perform private.emit_notification(v_author,'post_like',jsonb_build_object('post_id',p_post_id,'actor_id',auth.uid(),'title','New like','body','Someone liked your post'),'normal',null,'post:'||p_post_id||':likes',null);
    end if;

  elsif p_action='reaction' then
    if p_emoji is null or p_emoji not in ('❤️','😂','🔥','👍','👏','😮','🚀','😍','😢','😡','🎉','💯') then raise exception 'Invalid reaction'; end if;
    reactions := case when jsonb_typeof(d->'reactions')='object' then d->'reactions' else '{}'::jsonb end;
    k := p_emoji||'_users';
    users := case when jsonb_typeof(reactions->k)='array' then reactions->k else '[]'::jsonb end;
    had_target := users @> jsonb_build_array(uid);
    for oldk in select key from jsonb_each(reactions) where key like '%_users' loop
      users := case when jsonb_typeof(reactions->oldk)='array' then reactions->oldk else '[]'::jsonb end;
      if users @> jsonb_build_array(uid) then
        users := (select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(users) x where x <> to_jsonb(uid));
        reactions := jsonb_set(reactions,array[oldk],users,true);
        k := left(oldk,length(oldk)-6);
        reactions := jsonb_set(reactions,array[k],to_jsonb(jsonb_array_length(users)),true);
      end if;
    end loop;
    k := p_emoji||'_users';
    users := case when jsonb_typeof(reactions->k)='array' then reactions->k else '[]'::jsonb end;
    if had_target then
      users := (select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(users) x where x <> to_jsonb(uid));
    else
      users := users || jsonb_build_array(uid);
    end if;
    reactions := jsonb_set(reactions,array[k],users,true);
    reactions := jsonb_set(reactions,array[p_emoji],to_jsonb(jsonb_array_length(users)),true);
    d := jsonb_set(d,'{reactions}',reactions,true);
    if not had_target and v_author is not null and v_author <> auth.uid() then
      perform private.emit_notification(v_author,'post_reaction',jsonb_build_object('post_id',p_post_id,'actor_id',auth.uid(),'reaction',p_emoji,'title','New reaction','body','Someone reacted to your post'),'normal',null,'post:'||p_post_id||':reactions',null);
    end if;

  elsif p_action='comment' then
    if p_comment is null or jsonb_typeof(p_comment)<>'object' then raise exception 'Comment is required'; end if;
    comments := case when jsonb_typeof(d->'comments')='array' then d->'comments' else '[]'::jsonb end;
    comments := comments || (p_comment || jsonb_build_object('authorUid',uid));
    d := jsonb_set(d,'{comments}',comments,true);
    v_comment_id := nullif(coalesce(p_comment->>'id',gen_random_uuid()::text),'');
    if v_author is not null and v_author <> auth.uid() then
      perform private.emit_notification(v_author,'comment',jsonb_build_object('actor_id',auth.uid(),'post_id',p_post_id,'comment_id',v_comment_id,'body',left(coalesce(p_comment->>'text',p_comment->>'content',''),180),'title','New comment'),'normal','comment:'||v_comment_id,'post:'||p_post_id,null);
    end if;

  elsif p_action='save' or p_action='unsave' then
    select * into u from public.app_documents where path='users/'||uid for update;
    ud := coalesce(u.data,'{}'::jsonb);
    saved := case when jsonb_typeof(ud->'savedPosts')='array' then ud->'savedPosts' else '[]'::jsonb end;
    if p_action='save' then
      if not (saved @> jsonb_build_array(p_post_id)) then saved := saved || jsonb_build_array(p_post_id); end if;
    else
      saved := (select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(saved) x where x <> to_jsonb(p_post_id));
    end if;
    ud := jsonb_set(ud,'{savedPosts}',saved,true);
    if u.path is null then
      insert into public.app_documents(path,parent_path,collection_name,document_id,owner_id,data,created_at,updated_at)
      values('users/'||uid,'users','users',uid,auth.uid(),ud,now(),now());
    else
      update public.app_documents set data=ud,updated_at=now() where path=u.path;
    end if;
    d := jsonb_set(d,'{saveCount}',to_jsonb(greatest(0,coalesce((d->>'saveCount')::int,0) + case when p_action='save' then 1 else -1 end)),true);

  elsif p_action='view' then
    d := jsonb_set(d,'{views}',to_jsonb(coalesce((d->>'views')::int,0)+1),true);
  elsif p_action='share' then
    d := jsonb_set(d,'{shareCount}',to_jsonb(coalesce((d->>'shareCount')::int,coalesce((d->>'shares')::int,0))+1),true);
  else
    raise exception 'Unsupported interaction: %', p_action;
  end if;

  update public.app_documents set data=d,updated_at=now() where path=r.path;
  return d;
end;
$$;

create or replace function public.add_post_comment(p_post_id text, p_text text, p_parent_comment_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
 v_uid uuid:=auth.uid(); v_row public.app_documents; v_data jsonb; v_comments jsonb; v_comment jsonb;
 v_name text; v_avatar text; v_id text:=gen_random_uuid()::text;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if length(btrim(coalesce(p_text,'')))<1 or length(btrim(p_text))>5000 then raise exception 'Comment must be between 1 and 5000 characters'; end if;
 select * into v_row from public.app_documents where path='posts/'||p_post_id and collection_name='posts' for update;
 if not found then raise exception 'Post not found'; end if;
 v_data:=coalesce(v_row.data,'{}'::jsonb);
 v_comments:=case when jsonb_typeof(v_data->'comments')='array' then v_data->'comments' else '[]'::jsonb end;
 select coalesce(display_name,full_name,username,email,'User'),avatar_url into v_name,v_avatar from public.profiles where id=v_uid;
 v_comment:=jsonb_build_object('id',v_id,'postId',p_post_id,'authorUid',v_uid,'authorName',coalesce(v_name,'User'),'authorAvatar',coalesce(v_avatar,''),'text',btrim(p_text),'parentCommentId',nullif(p_parent_comment_id,''),'createdAt',now());
 insert into public.comments(id,post_id,user_id,parent_comment_id,content,created_at) values(v_id,p_post_id,v_uid,nullif(p_parent_comment_id,''),btrim(p_text),now());
 v_comments:=v_comments||jsonb_build_array(v_comment); v_data:=jsonb_set(v_data,'{comments}',v_comments,true);
 update public.app_documents set data=v_data,updated_at=now() where path=v_row.path;
 return jsonb_build_object('comment',v_comment,'comments',v_comments,'data',v_data);
end;
$$;

create or replace function public.toggle_post_like(p_post_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_uid uuid:=auth.uid(); v_row public.app_documents; v_data jsonb; v_likes jsonb; v_liked boolean; v_author uuid;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select * into v_row from public.app_documents where path='posts/'||p_post_id and collection_name='posts' for update;
 if not found then raise exception 'Post not found'; end if;
 v_data:=coalesce(v_row.data,'{}'::jsonb); v_likes:=case when jsonb_typeof(v_data->'likes')='array' then v_data->'likes' else '[]'::jsonb end;
 v_liked:=exists(select 1 from jsonb_array_elements_text(v_likes) x where x=v_uid::text);
 if v_liked then select coalesce(jsonb_agg(x order by ord),'[]'::jsonb) into v_likes from jsonb_array_elements_text(v_likes) with ordinality t(x,ord) where x<>v_uid::text; else v_likes:=v_likes||jsonb_build_array(v_uid::text); end if;
 v_data:=jsonb_set(v_data,'{likes}',v_likes,true); update public.app_documents set data=v_data,updated_at=now() where path=v_row.path;
 v_author:=nullif(v_data->>'authorUid','')::uuid;
 if not v_liked and v_author is not null and v_author<>v_uid then perform private.emit_notification(v_author,'post_like',jsonb_build_object('post_id',p_post_id,'actor_id',v_uid,'title','New like','body','Someone liked your post'),'normal',null,'post:'||p_post_id||':likes',null); end if;
 return jsonb_build_object('liked',not v_liked,'likes',v_likes,'data',v_data);
end; $$;

create or replace function public.toggle_post_reaction(p_post_id text, p_emoji text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_uid uuid:=auth.uid(); v_row public.app_documents; v_data jsonb; v_reactions jsonb; v_users jsonb; v_key text; v_has boolean; v_count integer; v_author uuid;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if p_emoji is null or not (p_emoji=any(array['❤️','😂','🔥','👍','👏','😮','🚀','😍','😢','😡','🎉','💯'])) then raise exception 'Unsupported reaction'; end if;
 select * into v_row from public.app_documents where path='posts/'||p_post_id and collection_name='posts' for update;
 if not found then raise exception 'Post not found'; end if;
 v_data:=coalesce(v_row.data,'{}'::jsonb); v_reactions:=case when jsonb_typeof(v_data->'reactions')='object' then v_data->'reactions' else '{}'::jsonb end;
 v_key:=p_emoji||'_users'; v_users:=case when jsonb_typeof(v_reactions->v_key)='array' then v_reactions->v_key else '[]'::jsonb end; v_has:=exists(select 1 from jsonb_array_elements_text(v_users) x where x=v_uid::text);
 if v_has then select coalesce(jsonb_agg(x order by ord),'[]'::jsonb) into v_users from jsonb_array_elements_text(v_users) with ordinality t(x,ord) where x<>v_uid::text; else v_users:=v_users||jsonb_build_array(v_uid::text); end if;
 v_count:=jsonb_array_length(v_users); v_reactions:=jsonb_set(v_reactions,array[v_key],v_users,true); v_reactions:=jsonb_set(v_reactions,array[p_emoji],to_jsonb(v_count),true); v_data:=jsonb_set(v_data,'{reactions}',v_reactions,true); update public.app_documents set data=v_data,updated_at=now() where path=v_row.path;
 v_author:=nullif(v_data->>'authorUid','')::uuid; if not v_has and v_author is not null and v_author<>v_uid then perform private.emit_notification(v_author,'post_reaction',jsonb_build_object('post_id',p_post_id,'actor_id',v_uid,'reaction',p_emoji,'title','New reaction','body','Someone reacted to your post'),'normal',null,'post:'||p_post_id||':reactions',null); end if;
 return jsonb_build_object('reacted',not v_has,'emoji',p_emoji,'reactions',v_reactions,'data',v_data);
end; $$;

create or replace function public.toggle_story_reaction(p_story_id uuid, p_reaction text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_old text; v_added boolean; v_author uuid;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if p_reaction is null or p_reaction not in ('❤️','😂','🔥','👍','👏','😮','🚀','😍','😢','😡','🎉','💯') then raise exception 'Unsupported reaction'; end if;
 if not exists(select 1 from public.app_documents where collection_name='stories' and document_id=p_story_id::text and coalesce((data->>'deleted')::boolean,false)=false) then raise exception 'Story not found'; end if;
 select reaction into v_old from public.story_reactions where story_id=p_story_id and user_id=v_uid;
 if v_old=p_reaction then delete from public.story_reactions where story_id=p_story_id and user_id=v_uid; v_added:=false; else insert into public.story_reactions(story_id,user_id,reaction) values(p_story_id,v_uid,p_reaction) on conflict(story_id,user_id) do update set reaction=excluded.reaction,created_at=now(); v_added:=true; end if;
 select nullif(data->>'authorUid','')::uuid into v_author from public.app_documents where collection_name='stories' and document_id=p_story_id::text;
 return jsonb_build_object('added',v_added,'reaction',case when v_added then p_reaction else null end);
end; $$;



create or replace function private.trg_story_activity_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare owner uuid; actor text; sid uuid; typ text; key text;
begin
 sid:=new.story_id;
 select nullif(data->>'authorUid','')::uuid into owner from public.app_documents where collection_name='stories' and document_id=sid::text limit 1;
 if owner is null or owner=new.user_id then return new; end if;
 select coalesce(display_name,username,'Someone') into actor from public.profiles where id=new.user_id;
 typ=case when tg_table_name='story_reactions' then 'story_reaction' else 'story_view' end;
 key=typ||':'||sid::text||':'||new.user_id::text||':'||coalesce(new.created_at,new.viewed_at)::text;
 perform private.emit_notification(owner,typ,jsonb_build_object('actor_id',new.user_id,'actor_name',actor,'story_id',sid,'reaction',case when typ='story_reaction' then new.reaction else null end,'title',case when typ='story_reaction' then 'Story reaction' else 'Story view' end,'body',case when typ='story_reaction' then coalesce(actor,'Someone')||' reacted to your story' else coalesce(actor,'Someone')||' viewed your story' end),'normal',key,'story:'||sid::text,null);
 return new;
end;
$$;
DROP TRIGGER IF EXISTS trg_spike_story_reaction_notifications ON public.story_reactions;
CREATE TRIGGER trg_spike_story_reaction_notifications
AFTER INSERT OR UPDATE ON public.story_reactions
FOR EACH ROW EXECUTE FUNCTION private.trg_story_activity_notification();
