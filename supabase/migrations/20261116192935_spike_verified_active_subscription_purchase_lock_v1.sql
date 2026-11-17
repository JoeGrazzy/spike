begin;

-- Prevent a second subscription request while a verified subscription is still active.
-- The advisory transaction lock serializes concurrent monthly/yearly requests for one user.
create or replace function private.spike_create_verified_subscription(p_plan text)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_uid uuid:=auth.uid(); v_spid text; v_id uuid; v_ref text; v_amount bigint;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_plan not in ('monthly','yearly') then raise exception 'Choose a valid monthly or yearly plan'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 730241));
  perform private.spike_expire_verified_subscriptions();
  if exists(select 1 from private.spike_verified_subscriptions where user_id=v_uid and status='active' and expires_at>now()) then
    raise exception 'Your SPIKE Verified subscription is already active. You can renew after it expires.' using errcode='55000';
  end if;
  select sp_id into v_spid from public.profiles where id=v_uid;
  if nullif(trim(coalesce(v_spid,'')),'') is null then raise exception 'A valid SPIKE SP ID is required before requesting verification'; end if;
  if private.spike_user_is_restricted(v_uid) then raise exception 'Your active SPIKE account restriction prevents a Verified subscription request'; end if;
  if exists(select 1 from private.spike_verified_subscriptions where user_id=v_uid and status in ('pending_payment','payment_reported','awaiting_identity')) then
    raise exception 'You already have an unresolved SPIKE Verified subscription request';
  end if;
  v_amount:=case when p_plan='monthly' then 50000 else 300000 end;
  v_ref:='SPV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  insert into private.spike_verified_identities(user_id,status) values(v_uid,'pending') on conflict(user_id) do nothing;
  insert into private.spike_verified_subscriptions(user_id,reference,plan,amount_minor,currency)
  values(v_uid,v_ref,p_plan,v_amount,'NGN') returning id into v_id;
  insert into public.notifications(user_id,type,data,priority)
  values(v_uid,'verified_subscription_request_created',jsonb_build_object('reference',v_ref,'plan',p_plan,'amount_minor',v_amount,'currency','NGN'),'normal');
  insert into public.admin_audit(actor_id,action,target_user_id,role,details)
  values(v_uid,'verified_subscription_request_created',v_uid,'user',jsonb_build_object('subscription_id',v_id,'reference',v_ref,'plan',p_plan,'amount_minor',v_amount));
  return jsonb_build_object('ok',true,'id',v_id,'reference',v_ref,'plan',p_plan,'amount_minor',v_amount,'currency','NGN','status','pending_payment');
end;
$function$;

commit;
