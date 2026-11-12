-- Serialize Follow/Unfollow against Feed block/unblock and DM block operations.
-- Both paths lock the same two account IDs in deterministic order.
create or replace function public.spike_set_follow_v1(p_target_user_id uuid, p_following boolean)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public','private','pg_temp'
as $function$
declare
 v_uid uuid:=auth.uid(); v_first uuid; v_second uuid;
 v_row public.app_documents%rowtype; v_data jsonb; v_following jsonb;
 v_is_following boolean; v_target_text text:=p_target_user_id::text;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_target_user_id is null or p_target_user_id=v_uid or p_following is null then raise exception 'Invalid follow request'; end if;
 v_first:=least(v_uid::text,p_target_user_id::text)::uuid;
 v_second:=greatest(v_uid::text,p_target_user_id::text)::uuid;
 perform pg_advisory_xact_lock(hashtextextended(v_first::text,0));
 perform pg_advisory_xact_lock(hashtextextended(v_second::text,0));
 select * into v_row from public.app_documents where path='users/'||v_uid::text
  and collection_name='users' and document_id=v_uid::text for update;
 if found and v_row.owner_id is not null and v_row.owner_id<>v_uid then raise exception 'Profile document ownership mismatch' using errcode='42501'; end if;
 v_data:=coalesce(v_row.data,'{}'::jsonb);
 v_following:=case when jsonb_typeof(v_data->'following')='array' then v_data->'following' else '[]'::jsonb end;
 v_is_following:=exists(select 1 from jsonb_array_elements(v_following) e(value)
  where case when jsonb_typeof(e.value)='string' then e.value #>> '{}'
   when jsonb_typeof(e.value)='object' then coalesce(e.value->>'id',e.value->>'user_id') else null end=v_target_text);
 if p_following then
  if not exists(select 1 from public.profiles where id=p_target_user_id) then raise exception 'SPIKE member not found'; end if;
  if not public.can_discover_spike_profile(v_uid,p_target_user_id)
    or not private.spike_social_pair_is_unblocked(v_uid,p_target_user_id) then
   raise exception 'This profile is not available to follow' using errcode='42501';
  end if;
 end if;
 if p_following and not v_is_following then v_following:=v_following||jsonb_build_array(v_target_text);
 elsif not p_following and v_is_following then
  select coalesce(jsonb_agg(e.value order by e.ordinality),'[]'::jsonb) into v_following
  from jsonb_array_elements(v_following) with ordinality e(value,ordinality)
  where case when jsonb_typeof(e.value)='string' then e.value #>> '{}'
   when jsonb_typeof(e.value)='object' then coalesce(e.value->>'id',e.value->>'user_id') else null end is distinct from v_target_text;
 else return jsonb_build_object('following',p_following,'changed',false); end if;
 v_data:=jsonb_set(v_data,'{following}',v_following,true);
 v_data:=jsonb_set(v_data,'{id}',to_jsonb(v_uid::text),true);
 v_data:=jsonb_set(v_data,'{updated_at}',to_jsonb(now()),true);
 if v_row.path is null then
  insert into public.app_documents(path,parent_path,collection_name,document_id,owner_id,data,created_at,updated_at)
  values('users/'||v_uid::text,'users','users',v_uid::text,v_uid,v_data,now(),now());
 else update public.app_documents set data=v_data,owner_id=coalesce(owner_id,v_uid),updated_at=now() where path=v_row.path; end if;
 return jsonb_build_object('following',p_following,'changed',true);
end;
$function$;
revoke all on function public.spike_set_follow_v1(uuid,boolean) from public,anon;
grant execute on function public.spike_set_follow_v1(uuid,boolean) to authenticated;

create or replace function public.spike_toggle_follow_v1(p_target_user_id uuid)
returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public','private','pg_temp'
as $function$
declare
 v_uid uuid:=auth.uid(); v_first uuid; v_second uuid;
 v_data jsonb; v_following jsonb; v_is_following boolean;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_target_user_id is null or p_target_user_id=v_uid then raise exception 'Invalid follow target'; end if;
 v_first:=least(v_uid::text,p_target_user_id::text)::uuid;
 v_second:=greatest(v_uid::text,p_target_user_id::text)::uuid;
 perform pg_advisory_xact_lock(hashtextextended(v_first::text,0));
 perform pg_advisory_xact_lock(hashtextextended(v_second::text,0));
 select data into v_data from public.app_documents where path='users/'||v_uid::text
  and collection_name='users' and document_id=v_uid::text for update;
 v_following:=case when jsonb_typeof(v_data->'following')='array' then v_data->'following' else '[]'::jsonb end;
 v_is_following:=exists(select 1 from jsonb_array_elements(v_following) e(value)
  where case when jsonb_typeof(e.value)='string' then e.value #>> '{}'
   when jsonb_typeof(e.value)='object' then coalesce(e.value->>'id',e.value->>'user_id') else null end=p_target_user_id::text);
 return public.spike_set_follow_v1(p_target_user_id,not v_is_following);
end;
$function$;
revoke all on function public.spike_toggle_follow_v1(uuid) from public,anon;
grant execute on function public.spike_toggle_follow_v1(uuid) to authenticated;

create or replace function private.spike_lock_feed_block_pair()
returns trigger language plpgsql set search_path = 'pg_catalog'
as $function$
declare v_left uuid; v_right uuid; v_first uuid; v_second uuid;
begin
 if tg_op='DELETE' then v_left:=old.blocker_id; v_right:=old.blocked_id;
 else v_left:=new.blocker_id; v_right:=new.blocked_id; end if;
 v_first:=least(v_left::text,v_right::text)::uuid;
 v_second:=greatest(v_left::text,v_right::text)::uuid;
 perform pg_advisory_xact_lock(hashtextextended(v_first::text,0));
 perform pg_advisory_xact_lock(hashtextextended(v_second::text,0));
 if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;
revoke all on function private.spike_lock_feed_block_pair() from public,anon,authenticated;
drop trigger if exists spike_feed_block_pair_lock on public.feed_blocks;
create trigger spike_feed_block_pair_lock before insert or delete on public.feed_blocks
for each row execute function private.spike_lock_feed_block_pair();
