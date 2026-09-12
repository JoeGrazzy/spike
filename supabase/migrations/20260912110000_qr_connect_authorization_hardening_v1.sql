-- QR connect hardening.
-- The QR flow uses the existing, audited friend-request mutation so
-- notifications, duplicate handling, and friendship creation remain centralized.

create or replace function public.connect_via_spike_qr(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_request public.friend_requests;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'Invalid connection target';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'SPIKE member not found';
  end if;
  if not public.can_discover_spike_profile(v_uid, p_user_id) then
    raise exception 'This SPIKE profile cannot be connected to';
  end if;

  -- Reuse the existing friend-request RPC. It handles reverse pending
  -- requests by accepting them and creates both friendship rows atomically.
  select * into v_request
  from public.send_friend_request(p_user_id);

  if v_request.status = 'accepted' then
    return jsonb_build_object('status','friends','request_id',v_request.id);
  end if;

  return jsonb_build_object('status','requested','request_id',v_request.id);
end;
$$;

revoke execute on function public.connect_via_spike_qr(uuid) from public, anon;
grant execute on function public.connect_via_spike_qr(uuid) to authenticated;
