-- Fix the JSON access in the canonical save branch.
create or replace function public.mutate_post_interaction(p_post_id text,p_action text,p_emoji text default null,p_comment jsonb default null) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare r public.app_documents%rowtype; u public.app_documents%rowtype; d jsonb; ud jsonb; reactions jsonb; users jsonb; comments jsonb; saved jsonb; k text; uid text:=auth.uid()::text; oldk text; had_like boolean:=false; had_target boolean:=false; v_author uuid; v_comment_id text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.app_documents where collection_name='posts' and document_id=p_post_id for update;
 if not found or coalesce((r.data->>'deleted')::boolean,false) then raise exception 'Post not found'; end if;
 d:=coalesce(r.data,'{}'::jsonb); v_author:=nullif(d->>'authorUid','')::uuid;
 if p_action='like' then
  reactions:=case when jsonb_typeof(d->'reactions')='object' then d->'reactions' else '{}'::jsonb end; users:=case when jsonb_typeof(reactions->'like_users')='array' then reactions->'like_users' else '[]'::jsonb end; had_like:=users @> jsonb_build_array(uid);
  if had_like then users:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(users) x where x<>to_jsonb(uid)); else users:=users||jsonb_build_array(uid); end if;
  reactions:=jsonb_set(reactions,'{like_users}',users,true); reactions:=jsonb_set(reactions,'{like}',to_jsonb(jsonb_array_length(users)),true); d:=jsonb_set(d,'{reactions}',reactions,true)-'likes'; if not had_like then perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'like','{}'::jsonb); end if;
 elsif p_action='reaction' then
  if p_emoji is null or p_emoji not in ('❤️','😂','🔥','👍','👏','😮','🚀','😍','😢','😡','🎉','💯') then raise exception 'Invalid reaction'; end if;
  reactions:=case when jsonb_typeof(d->'reactions')='object' then d->'reactions' else '{}'::jsonb end; k:=p_emoji||'_users'; users:=case when jsonb_typeof(reactions->k)='array' then reactions->k else '[]'::jsonb end; had_target:=users @> jsonb_build_array(uid);
  for oldk in select key from jsonb_each(reactions) where key like '%_users' loop users:=case when jsonb_typeof(reactions->oldk)='array' then reactions->oldk else '[]'::jsonb end; if users @> jsonb_build_array(uid) then users:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(users) x where x<>to_jsonb(uid)); reactions:=jsonb_set(reactions,array[oldk],users,true); k:=left(oldk,length(oldk)-6); reactions:=jsonb_set(reactions,array[k],to_jsonb(jsonb_array_length(users)),true); end if; end loop;
  k:=p_emoji||'_users'; users:=case when jsonb_typeof(reactions->k)='array' then reactions->k else '[]'::jsonb end; if had_target then users:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(users) x where x<>to_jsonb(uid)); else users:=users||jsonb_build_array(uid); end if; reactions:=jsonb_set(reactions,array[k],users,true); reactions:=jsonb_set(reactions,array[p_emoji],to_jsonb(jsonb_array_length(users)),true); d:=jsonb_set(d,'{reactions}',reactions,true); if not had_target then perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'reaction',jsonb_build_object('reaction',p_emoji)); end if;
 elsif p_action='comment' then
  if p_comment is null or jsonb_typeof(p_comment)<>'object' then raise exception 'Comment is required'; end if; comments:=case when jsonb_typeof(d->'comments')='array' then d->'comments' else '[]'::jsonb end; comments:=comments||(p_comment||jsonb_build_object('authorUid',uid)); d:=jsonb_set(d,'{comments}',comments,true); v_comment_id:=nullif(coalesce(p_comment->>'id',gen_random_uuid()::text),''); perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'comment',jsonb_build_object('comment_id',v_comment_id,'text',left(coalesce(p_comment->>'text',p_comment->>'content',''),5000)));
 elsif p_action='save' or p_action='unsave' then
  select * into u from public.app_documents where path='users/'||uid for update; ud:=coalesce(u.data,'{}'::jsonb); saved:=case when jsonb_typeof(ud->'savedPosts')='array' then ud->'savedPosts' else '[]'::jsonb end;
  if p_action='save' then if not(saved @> jsonb_build_array(p_post_id)) then saved:=saved||jsonb_build_array(p_post_id); end if; else saved:=(select coalesce(jsonb_agg(x),'[]'::jsonb) from jsonb_array_elements(saved) x where x<>to_jsonb(p_post_id)); end if;
  ud:=jsonb_set(ud,'{savedPosts}',saved,true); if u.path is null then insert into public.app_documents(path,parent_path,collection_name,document_id,owner_id,data,created_at,updated_at) values('users/'||uid,'users','users',uid,auth.uid(),ud,now(),now()); else update public.app_documents set data=ud,updated_at=now() where path=u.path; end if;
  d:=jsonb_set(d,'{saveCount}',to_jsonb(greatest(0,coalesce((d->>'saveCount')::int,0)+case when p_action='save' then 1 else -1 end)),true); if p_action='save' then perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'save','{}'::jsonb); end if;
 elsif p_action='view' then d:=jsonb_set(d,'{views}',to_jsonb(coalesce((d->>'views')::int,0)+1),true); perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'view','{}'::jsonb);
 elsif p_action='share' then d:=jsonb_set(d,'{shareCount}',to_jsonb(coalesce((d->>'shareCount')::int,coalesce((d->>'shares')::int,0))+1),true); perform private.log_post_engagement(v_author,auth.uid(),p_post_id,'share','{}'::jsonb);
 else raise exception 'Unsupported interaction: %',p_action; end if;
 update public.app_documents set data=d,updated_at=now() where path=r.path; return d;
end; $$;
revoke all on function public.mutate_post_interaction(text,text,text,jsonb) from public,anon;
grant execute on function public.mutate_post_interaction(text,text,text,jsonb) to authenticated;
