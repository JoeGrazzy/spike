create or replace function public.spike_admin_get_user_activity(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='pg_catalog','public','auth','private' as $$
begin
 if not private.is_admin() then raise exception 'Only the SPIKE owner can inspect account activity.'; end if;
 if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Account not found.'; end if;
 return jsonb_build_object('posts',(select count(*) from public.posts where author_id=p_user_id),'comments',(select count(*) from public.comments where author_id=p_user_id),'direct_messages',(select count(*) from public.messages where sender_id=p_user_id),'room_messages',(select count(*) from public.room_messages where sender_id=p_user_id),'reports_submitted',(select count(*) from public.reports where reporter_id=p_user_id),'reports_targeting_user',(select count(*) from public.reports where target_id=p_user_id));
end; $$;
revoke all on function public.spike_admin_get_user_activity(uuid) from public,anon;
grant execute on function public.spike_admin_get_user_activity(uuid) to authenticated;
