create table if not exists private.spike_room_live_audio_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.spike_rooms(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','consumed','completed')),
  fee_coins integer not null default 100 check (fee_coins = 100),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  approved_start_expires_at timestamptz,
  consumed_at timestamptz,
  session_id uuid,
  refunded_at timestamptz,
  completed_at timestamptz,
  unique(requester_id, request_key)
);
create index if not exists spike_room_live_audio_requests_room_pending_idx
  on private.spike_room_live_audio_requests(room_id, created_at)
  where status in ('pending','approved');
create unique index if not exists spike_room_live_audio_requests_one_pending_per_member
  on private.spike_room_live_audio_requests(room_id, requester_id)
  where status in ('pending','approved');
revoke all on private.spike_room_live_audio_requests from public, anon, authenticated;

create or replace function private.spike_room_live_audio_expire_requests()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; v_count integer := 0;
begin
  for r in
    select id, requester_id from private.spike_room_live_audio_requests
    where (status = 'pending' and expires_at <= now())
       or (status = 'approved' and approved_start_expires_at <= now())
    order by created_at for update skip locked
  loop
    update private.spike_room_live_audio_requests set status='expired',refunded_at=now() where id=r.id;
    perform set_config('request.jwt.claim.sub',r.requester_id::text,true);
    perform private.spike_apply_coin_delta_with_sources(r.requester_id,100,'refund',
      'SPLR:'||r.id::text||':REFUND','Refund for expired SPIKE room live-audio request');
    v_count:=v_count+1;
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  return v_count;
end; $$;
revoke all on function private.spike_room_live_audio_expire_requests() from public,anon,authenticated;

create or replace function public.spike_room_live_audio_request(p_room_id uuid,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_room public.spike_rooms; v_existing private.spike_room_live_audio_requests; v_id uuid:=gen_random_uuid(); v_charge jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_room_id is null or p_request_key is null then raise exception 'Room and request key are required'; end if;
  perform private.spike_room_live_audio_expire_requests();
  perform private.spike_require_verified_room_access(v_uid);
  if private.spike_user_is_restricted(v_uid) then raise exception 'Your account restriction prevents live-audio requests'; end if;
  select * into v_room from public.spike_rooms where id=p_room_id for update;
  if not found or v_room.status<>'live' then raise exception 'Requests are available only in a live room'; end if;
  if not exists(select 1 from public.spike_room_members m where m.room_id=p_room_id and m.user_id=v_uid and m.member_state='active') then raise exception 'Join the room before requesting live audio'; end if;
  select * into v_existing from private.spike_room_live_audio_requests where requester_id=v_uid and request_key=p_request_key;
  if found then return jsonb_build_object('ok',true,'already_processed',true,'request_id',v_existing.id,'status',v_existing.status,'expires_at',v_existing.expires_at); end if;
  if exists(select 1 from private.spike_room_live_audio_sessions s where s.room_id=p_room_id and s.status='active') then raise exception 'Live audio is already active in this room'; end if;
  if exists(select 1 from private.spike_room_live_audio_requests q where q.room_id=p_room_id and q.requester_id=v_uid and q.status in ('pending','approved')) then raise exception 'You already have a live-audio request awaiting action'; end if;
  v_charge:=private.spike_apply_coin_delta_with_sources(v_uid,-100,'spend','SPLR:'||v_id::text||':FEE','SPIKE room live-audio request fee');
  insert into private.spike_room_live_audio_requests(id,room_id,requester_id,request_key) values(v_id,p_room_id,v_uid,p_request_key);
  return jsonb_build_object('ok',true,'request_id',v_id,'status','pending','fee_coins',100,'expires_at',now()+interval '5 minutes','wallet_balance_after',v_charge->'wallet_balance_after');
end; $$;

create or replace function public.spike_room_live_audio_request_state(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_owner boolean; v_requests jsonb;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.spike_room_members m where m.room_id=p_room_id and m.user_id=v_uid and m.member_state='active') then raise exception 'Active room membership is required'; end if;
  perform private.spike_room_live_audio_expire_requests();
  select exists(select 1 from public.spike_rooms r where r.id=p_room_id and (r.host_id=v_uid or r.active_host_id=v_uid)) into v_owner;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'requester_id',q.requester_id,
    'requester_name',coalesce(p.display_name,p.full_name,p.username,'SPIKE member'),'requester_username',p.username,
    'requester_avatar_url',p.avatar_url,'status',q.status,'created_at',q.created_at,
    'expires_at',case when q.status='approved' then q.approved_start_expires_at else q.expires_at end,'fee_coins',q.fee_coins) order by q.created_at),'[]'::jsonb)
  into v_requests from private.spike_room_live_audio_requests q left join public.profiles p on p.id=q.requester_id
  where q.room_id=p_room_id and ((v_owner and q.status in ('pending','approved')) or (not v_owner and q.requester_id=v_uid and q.status in ('pending','approved','rejected','expired','consumed','completed') and q.created_at>now()-interval '1 day'));
  return jsonb_build_object('ok',true,'is_owner',v_owner,'requests',v_requests);
end; $$;

create or replace function public.spike_room_live_audio_decide_request(p_request_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_req private.spike_room_live_audio_requests; v_room public.spike_rooms;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_action not in ('approve','reject') then raise exception 'Choose approve or reject'; end if;
  perform private.spike_room_live_audio_expire_requests();
  select r.* into v_req from private.spike_room_live_audio_requests r where r.id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  select * into v_room from public.spike_rooms where id=v_req.room_id;
  if v_room.host_id<>v_uid and v_room.active_host_id<>v_uid then raise exception 'Only the room owner can decide live-audio requests'; end if;
  if v_req.status<>'pending' or v_req.expires_at<=now() then raise exception 'This request has expired or was already handled'; end if;
  if p_action='approve' then
    update private.spike_room_live_audio_requests set status='approved',decided_at=now(),decided_by=v_uid,approved_start_expires_at=now()+interval '5 minutes' where id=p_request_id;
    return jsonb_build_object('ok',true,'status','approved','start_expires_at',now()+interval '5 minutes');
  end if;
  update private.spike_room_live_audio_requests set status='rejected',decided_at=now(),decided_by=v_uid,refunded_at=now() where id=p_request_id;
  perform set_config('request.jwt.claim.sub',v_req.requester_id::text,true);
  perform private.spike_apply_coin_delta_with_sources(v_req.requester_id,100,'refund','SPLR:'||v_req.id::text||':REFUND','Refund for rejected SPIKE room live-audio request');
  perform set_config('request.jwt.claim.sub',v_uid::text,true);
  return jsonb_build_object('ok',true,'status','rejected','refunded',100);
end; $$;

create or replace function private.spike_room_live_audio_require_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_request private.spike_room_live_audio_requests;
begin
  select * into v_request from private.spike_room_live_audio_requests
  where room_id=new.room_id and requester_id=new.broadcaster_id and status='approved' and approved_start_expires_at>now()
  order by decided_at desc limit 1 for update;
  if not found then raise exception 'Room owner approval is required before you can go live'; end if;
  update private.spike_room_live_audio_requests set status='consumed',consumed_at=now(),session_id=new.id where id=v_request.id;
  return new;
end; $$;

create or replace function private.spike_room_live_audio_complete_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status='active' and new.status<>'active' then
    update private.spike_room_live_audio_requests set status='completed',completed_at=now() where session_id=new.id and status='consumed';
  end if;
  return new;
end; $$;

drop trigger if exists spike_room_live_audio_require_approval on private.spike_room_live_audio_sessions;
create trigger spike_room_live_audio_require_approval before insert on private.spike_room_live_audio_sessions for each row execute function private.spike_room_live_audio_require_approval();
drop trigger if exists spike_room_live_audio_complete_request on private.spike_room_live_audio_sessions;
create trigger spike_room_live_audio_complete_request after update of status on private.spike_room_live_audio_sessions for each row execute function private.spike_room_live_audio_complete_request();

revoke all on function public.spike_room_live_audio_request(uuid,uuid) from public,anon;
revoke all on function public.spike_room_live_audio_request_state(uuid) from public,anon;
revoke all on function public.spike_room_live_audio_decide_request(uuid,text) from public,anon;
grant execute on function public.spike_room_live_audio_request(uuid,uuid) to authenticated;
grant execute on function public.spike_room_live_audio_request_state(uuid) to authenticated;
grant execute on function public.spike_room_live_audio_decide_request(uuid,text) to authenticated;

create extension if not exists pg_cron with schema pg_catalog;
do $$ begin
  if exists(select 1 from pg_namespace where nspname='cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='spike-live-audio-request-expiry';
    perform cron.schedule('spike-live-audio-request-expiry','* * * * *','select private.spike_room_live_audio_expire_requests();');
  end if;
end; $$;
