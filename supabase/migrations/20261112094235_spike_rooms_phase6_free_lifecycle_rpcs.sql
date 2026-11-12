-- SPIKE Rooms Phase 6: free, server-authoritative lifecycle RPCs.
-- Additive only: no tables, policies, triggers, protected migrations or shared data are removed.

create or replace function public.room_public_join(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_uid uuid := auth.uid(); v_room public.rooms; v_member public.room_members;
begin
  if v_uid is null then raise exception 'Sign in to join this Room'; end if;
  if p_room_id is null then raise exception 'Room was not found'; end if;
  select * into v_room from public.rooms where id=p_room_id and active=true for share;
  if not found then raise exception 'This Room is unavailable'; end if;
  if exists(select 1 from public.room_bans b where b.room_id=p_room_id and b.user_id=v_uid) then raise exception 'You cannot join this Room'; end if;
  insert into public.room_members(room_id,user_id,role,active)
  values(p_room_id,v_uid,case when v_room.owner_id=v_uid then 'owner' else 'member' end,true)
  on conflict(room_id,user_id) do update set active=true,
    role=case when public.room_members.role in ('owner','admin','moderator') then public.room_members.role else 'member' end
  returning * into v_member;
  return jsonb_build_object('room_id',v_member.room_id,'user_id',v_member.user_id,'role',v_member.role,'active',v_member.active,'joined_at',v_member.joined_at,'already_member',v_member.joined_at < now()-interval '1 second');
end; $function$;

create or replace function public.room_public_leave(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_uid uuid := auth.uid(); v_owner uuid;
begin
  if v_uid is null then raise exception 'Sign in to continue'; end if;
  select owner_id into v_owner from public.rooms where id=p_room_id and active=true;
  if not found then raise exception 'This Room is unavailable'; end if;
  if v_owner=v_uid then raise exception 'Room owners must transfer ownership before leaving'; end if;
  update public.room_members set active=false where room_id=p_room_id and user_id=v_uid and active=true;
  return jsonb_build_object('room_id',p_room_id,'left',true);
end; $function$;

create or replace function public.room_public_create(
 p_name text,p_description text,p_emoji text,p_category text,p_tags text[],p_avatar_url text,p_cover_url text,p_rules text,
 p_handle text,p_display_name text,p_bio text default null
) returns public.rooms language plpgsql security definer set search_path = public as $function$
declare v_uid uuid:=auth.uid(); v_room public.rooms; v_handle text; v_display text;
begin
  if v_uid is null then raise exception 'Sign in to create a Room'; end if;
  if length(trim(coalesce(p_name,'')))<2 then raise exception 'Room name must be at least 2 characters'; end if;
  if length(trim(coalesce(p_name,'')))>48 then raise exception 'Room name is too long'; end if;
  if length(coalesce(p_description,''))>500 then raise exception 'Description is too long'; end if;
  if length(coalesce(p_rules,''))>2000 then raise exception 'Guidelines are too long'; end if;
  if not exists(select 1 from public.room_accounts where user_id=v_uid) then
    v_handle:=lower(regexp_replace(trim(coalesce(p_handle,'')),'[^a-zA-Z0-9_]+','','g'));
    v_display:=left(trim(coalesce(p_display_name,'')),80);
    if length(v_handle)<3 or length(v_handle)>24 then raise exception 'Choose a Room handle between 3 and 24 characters'; end if;
    if v_display='' then raise exception 'Enter your Room display name'; end if;
    insert into public.room_accounts(user_id,handle,display_name,bio,icon)
    values(v_uid,v_handle,v_display,nullif(left(trim(coalesce(p_bio,'')),500),''),'🌱');
  end if;
  if not public.room_rate_limit_check('room-create:'||v_uid::text,5,3600) then raise exception 'You have reached the Room creation limit. Try again later'; end if;
  insert into public.rooms(owner_id,name,description,emoji,category,tags,avatar_url,cover_url,rules,active,featured)
  values(v_uid,left(trim(p_name),48),left(coalesce(p_description,''),500),left(coalesce(nullif(trim(p_emoji),''),'🌐'),16),
    left(coalesce(nullif(trim(p_category),''),'General'),80),coalesce(p_tags,'{}'),p_avatar_url,p_cover_url,nullif(left(trim(coalesce(p_rules,'')),2000),''),true,false)
  returning * into v_room;
  insert into public.room_members(room_id,user_id,role,active) values(v_room.id,v_uid,'owner',true)
  on conflict(room_id,user_id) do update set role='owner',active=true;
  insert into public.room_channels(room_id,name) values(v_room.id,'general') on conflict(room_id,name) do nothing;
  return v_room;
end; $function$;

revoke all on function public.room_public_join(uuid) from public;
revoke all on function public.room_public_leave(uuid) from public;
revoke all on function public.room_public_create(text,text,text,text,text[],text,text,text,text,text,text) from public;
grant execute on function public.room_public_join(uuid) to authenticated;
grant execute on function public.room_public_leave(uuid) to authenticated;
grant execute on function public.room_public_create(text,text,text,text,text[],text,text,text,text,text,text) to authenticated;
