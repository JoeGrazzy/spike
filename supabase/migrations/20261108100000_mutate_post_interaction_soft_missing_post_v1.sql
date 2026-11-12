-- Soft-fail passive creator engagement when the target post is missing or deleted.
-- IntersectionObserver "view" events race with deletes and stale client cards.

create or replace function public.mutate_post_interaction(
  p_post_id text,
  p_action text,
  p_emoji text default null,
  p_comment jsonb default null
) returns jsonb
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
  select * into r from public.app_documents where collection_name='posts' and document_id=p_post_id for update;
  if not found or coalesce((r.data->>'deleted')::boolean,false) then
    if p_action in ('view','share') then
      return jsonb_build_object('ok', false, 'reason', 'post_not_found');
    end if;
    raise exception 'Post not found';
  end if;
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
      if users @> jsonb_build_array(uid) and oldk<>k then
        users:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(users) x where x<>to_jsonb(uid));
        reactions:=jsonb_set(reactions,array[oldk],users,true);
        reactions:=jsonb_set(reactions,array[replace(oldk,'_users','')],to_jsonb(jsonb_array_length(users)),true);
      end if;
    end loop;
    users:=case when jsonb_typeof(reactions->k)='array' then reactions->k else '[]'::jsonb end;
    if had_target then users:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(users) x where x<>to_jsonb(uid)); else users:=users||jsonb_build_array(uid); end if;
    reactions:=jsonb_set(reactions,array[k],users,true); reactions:=jsonb_set(reactions,array[p_emoji],to_jsonb(jsonb_array_length(users)),true); d:=jsonb_set(d,'{reactions}',reactions,true);
    if not had_target then perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'reaction',jsonb_build_object('emoji',p_emoji)); end if;
  elsif p_action='comment' then
    if p_comment is null then raise exception 'Comment required'; end if;
    comments:=case when jsonb_typeof(d->'comments')='array' then d->'comments' else '[]'::jsonb end;
    v_comment_id:=coalesce(nullif(p_comment->>'id',''),gen_random_uuid()::text);
    comments:=comments||jsonb_build_array(jsonb_set(p_comment,'{id}',to_jsonb(v_comment_id),true));
    d:=jsonb_set(d,'{comments}',comments,true);
    perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'comment',jsonb_build_object('comment_id',v_comment_id));
  elsif p_action='save' then
    select * into u from public.app_documents where collection_name='users' and document_id=uid for update;
    if not found then raise exception 'User profile not found'; end if;
    ud:=coalesce(u.data,'{}'::jsonb);
    saved:=case when jsonb_typeof(ud->'savedPosts')='array' then ud->'savedPosts' else '[]'::jsonb end;
    if not (saved @> jsonb_build_array(p_post_id)) then
      saved:=saved||jsonb_build_array(p_post_id);
      ud:=jsonb_set(ud,'{savedPosts}',saved,true);
      update public.app_documents set data=ud,updated_at=now() where path=u.path;
      perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'save','{}'::jsonb);
    end if;
  elsif p_action='unsave' then
    select * into u from public.app_documents where collection_name='users' and document_id=uid for update;
    if not found then raise exception 'User profile not found'; end if;
    ud:=coalesce(u.data,'{}'::jsonb);
    saved:=case when jsonb_typeof(ud->'savedPosts')='array' then ud->'savedPosts' else '[]'::jsonb end;
    saved:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(saved) x where x<>to_jsonb(p_post_id));
    ud:=jsonb_set(ud,'{savedPosts}',saved,true);
    update public.app_documents set data=ud,updated_at=now() where path=u.path;
  elsif p_action='view' then
    d:=jsonb_set(d,'{views}',to_jsonb(coalesce((d->>'views')::int,0)+1),true);
    perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'view','{}'::jsonb);
  elsif p_action='share' then
    d:=jsonb_set(d,'{shareCount}',to_jsonb(coalesce((d->>'shareCount')::int,coalesce((d->>'shares')::int,0))+1),true);
    perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'share','{}'::jsonb);
  else
    raise exception 'Unsupported interaction: %', p_action;
  end if;
  update public.app_documents set data=d,updated_at=now() where path=r.path;
  return d;
end;
$$;

revoke all on function public.mutate_post_interaction(text,text,text,jsonb) from public, anon;
grant execute on function public.mutate_post_interaction(text,text,text,jsonb) to authenticated;
