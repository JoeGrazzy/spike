create or replace function public.room_moderation_mute(p_room_id uuid,p_user_id uuid,p_duration_seconds integer,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare actor_role text; target_role text; owner_id uuid;
begin
 if not public.room_staff(p_room_id) then raise exception 'Not authorized'; end if;
 select r.owner_id into owner_id from public.rooms r where r.id=p_room_id;
 if p_user_id=owner_id then raise exception 'The room owner cannot be muted'; end if;
 select m.role into actor_role from public.room_members m where m.room_id=p_room_id and m.user_id=auth.uid();
 select m.role into target_role from public.room_members m where m.room_id=p_room_id and m.user_id=p_user_id and m.active=true;
 if target_role is null then raise exception 'Member not found'; end if;
 if actor_role='moderator' and target_role in ('admin','moderator','owner') then raise exception 'You cannot moderate another staff member'; end if;
 if p_duration_seconds is not null and p_duration_seconds<0 then raise exception 'Invalid duration'; end if;
 insert into public.room_mutes(room_id,user_id,muted_by,expires_at,reason) values(p_room_id,p_user_id,auth.uid(),case when p_duration_seconds is null or p_duration_seconds=0 then null else now()+make_interval(secs=>p_duration_seconds) end,p_reason) on conflict(room_id,user_id) do update set muted_by=auth.uid(),expires_at=excluded.expires_at,reason=excluded.reason,created_at=now();
 insert into public.room_moderation_actions(room_id,moderator_id,target_user_id,action,duration_seconds,reason) values(p_room_id,auth.uid(),p_user_id,'mute',p_duration_seconds,p_reason);
 return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.room_moderation_remove(p_room_id uuid,p_user_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare actor_role text; target_role text; owner_id uuid;
begin
 if not public.room_staff(p_room_id) then raise exception 'Not authorized'; end if;
 if p_user_id=auth.uid() then raise exception 'Cannot remove yourself'; end if;
 select r.owner_id into owner_id from public.rooms r where r.id=p_room_id;
 if p_user_id=owner_id then raise exception 'The room owner cannot be removed'; end if;
 select m.role into actor_role from public.room_members m where m.room_id=p_room_id and m.user_id=auth.uid();
 select m.role into target_role from public.room_members m where m.room_id=p_room_id and m.user_id=p_user_id and m.active=true;
 if target_role is null then raise exception 'Member not found'; end if;
 if actor_role='moderator' and target_role in ('admin','moderator','owner') then raise exception 'You cannot moderate another staff member'; end if;
 delete from public.room_members where room_id=p_room_id and user_id=p_user_id;
 insert into public.room_moderation_actions(room_id,moderator_id,target_user_id,action,reason) values(p_room_id,auth.uid(),p_user_id,'remove',p_reason);
 return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.room_moderation_ban(p_room_id uuid,p_user_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $function$
declare actor_role text; target_role text; owner_id uuid;
begin
 if not public.room_staff(p_room_id) then raise exception 'Not authorized'; end if;
 if p_user_id=auth.uid() then raise exception 'Cannot ban yourself'; end if;
 select r.owner_id into owner_id from public.rooms r where r.id=p_room_id;
 if p_user_id=owner_id then raise exception 'The room owner cannot be banned'; end if;
 select m.role into actor_role from public.room_members m where m.room_id=p_room_id and m.user_id=auth.uid();
 select m.role into target_role from public.room_members m where m.room_id=p_room_id and m.user_id=p_user_id and m.active=true;
 if target_role is null then raise exception 'Member not found'; end if;
 if actor_role='moderator' and target_role in ('admin','moderator','owner') then raise exception 'You cannot moderate another staff member'; end if;
 insert into public.room_bans(room_id,user_id,banned_by,reason) values(p_room_id,p_user_id,auth.uid(),p_reason) on conflict(room_id,user_id) do update set banned_by=auth.uid(),reason=excluded.reason,created_at=now();
 delete from public.room_members where room_id=p_room_id and user_id=p_user_id;
 insert into public.room_moderation_actions(room_id,moderator_id,target_user_id,action,reason) values(p_room_id,auth.uid(),p_user_id,'ban',p_reason);
 return jsonb_build_object('ok',true);
end;
$function$;
