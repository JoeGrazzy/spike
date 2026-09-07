-- SPIKE single-device login enforcement.
alter table public.spike_device_sessions add column if not exists device_id uuid;
alter table public.spike_device_sessions add column if not exists session_id uuid;
alter table public.spike_device_sessions add column if not exists updated_at timestamptz not null default now();

drop function if exists public.spike_device_session_status(uuid);
create or replace function public.spike_device_session_status(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_session uuid := nullif(auth.jwt()->>'session_id','')::uuid; r record;
begin
 if v_user is null or v_session is null or p_device_id is null then raise exception 'Not authenticated'; end if;
 select * into r from public.spike_device_sessions where user_id=v_user and revoked_at is null order by last_seen_at desc limit 1;
 if not found then return jsonb_build_object('has_other_device',false,'same_device',false); end if;
 return jsonb_build_object('has_other_device', r.last_seen_at > now()-interval '2 minutes' and r.session_id <> v_session and r.device_id <> p_device_id, 'same_device', r.device_id = p_device_id, 'last_seen', r.last_seen_at);
end; $$;

drop function if exists public.spike_device_session_claim(uuid);
create or replace function public.spike_device_session_claim(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_session uuid := nullif(auth.jwt()->>'session_id','')::uuid;
begin
 if v_user is null or v_session is null or p_device_id is null then raise exception 'Not authenticated'; end if;
 update public.spike_device_sessions set revoked_at=coalesce(revoked_at,now()), updated_at=now() where user_id=v_user and revoked_at is null;
 insert into public.spike_device_sessions(id,user_id,device_id,session_id,device_label,platform,user_agent,last_seen_at,revoked_at,created_at,updated_at)
 values(gen_random_uuid(),v_user,p_device_id,v_session,'SPIKE active device','web','',now(),null,now(),now());
 return jsonb_build_object('ok',true);
end; $$;

drop function if exists public.spike_device_session_heartbeat(uuid);
create or replace function public.spike_device_session_heartbeat(p_device_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_session uuid := nullif(auth.jwt()->>'session_id','')::uuid;
begin
 if v_user is null or v_session is null or p_device_id is null then return false; end if;
 update public.spike_device_sessions set last_seen_at=now(), updated_at=now() where user_id=v_user and device_id=p_device_id and session_id=v_session and revoked_at is null;
 return found;
end; $$;

grant execute on function public.spike_device_session_status(uuid) to authenticated;
grant execute on function public.spike_device_session_claim(uuid) to authenticated;
grant execute on function public.spike_device_session_heartbeat(uuid) to authenticated;
revoke execute on function public.spike_device_session_status(uuid) from public, anon;
revoke execute on function public.spike_device_session_claim(uuid) from public, anon;
revoke execute on function public.spike_device_session_heartbeat(uuid) from public, anon;
grant execute on function public.spike_device_session_status(uuid) to authenticated;
grant execute on function public.spike_device_session_claim(uuid) to authenticated;
grant execute on function public.spike_device_session_heartbeat(uuid) to authenticated;
