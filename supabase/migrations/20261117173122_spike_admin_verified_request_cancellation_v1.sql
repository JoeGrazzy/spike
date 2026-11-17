-- Allow the owner to cancel unpaid Verified subscription requests without
-- confusing cancellation with a failed payment or an identity revocation.
alter table private.spike_verified_subscriptions
  drop constraint if exists spike_verified_subscriptions_status_check;
alter table private.spike_verified_subscriptions
  add constraint spike_verified_subscriptions_status_check
  check (status = any (array[
    'pending_payment','payment_reported','awaiting_identity','active',
    'expired','rejected','revoked','cancelled'
  ]::text[]));

create or replace function private.admin_cancel_verified_subscription_request(
  p_subscription_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sub private.spike_verified_subscriptions;
  v_reason text := nullif(left(trim(coalesce(p_reason,'')),500),'');
begin
  if auth.uid() is null or not private.spike_is_owner() then
    raise exception 'Dedicated Owner access required' using errcode = '42501';
  end if;
  if p_subscription_id is null or v_reason is null then
    raise exception 'Subscription request and cancellation reason are required';
  end if;

  select * into v_sub
  from private.spike_verified_subscriptions
  where id = p_subscription_id
  for update;

  if not found or v_sub.status <> 'pending_payment' or v_sub.payment_status <> 'pending' then
    raise exception 'Only an unpaid pending subscription request can be cancelled';
  end if;

  update private.spike_verified_subscriptions
  set status = 'cancelled',
      payment_rejection_reason = v_reason,
      decided_by = auth.uid(),
      decided_at = now(),
      updated_at = now()
  where id = v_sub.id;

  insert into public.notifications(user_id,type,data,priority)
  values(v_sub.user_id,'verified_subscription_request_cancelled',
    jsonb_build_object('reference',v_sub.reference,'plan',v_sub.plan,'reason',v_reason),'normal');

  insert into public.admin_audit(actor_id,action,target_user_id,role,details)
  values(auth.uid(),'verified_subscription_request_cancelled',v_sub.user_id,'owner',
    jsonb_build_object('subscription_id',v_sub.id,'reference',v_sub.reference,'reason',v_reason));

  return jsonb_build_object('ok',true,'status','cancelled','reference',v_sub.reference);
end;
$function$;

create or replace function public.admin_cancel_verified_subscription_request(
  p_subscription_id uuid,
  p_reason text
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.admin_cancel_verified_subscription_request(p_subscription_id,p_reason);
$function$;

revoke all on function private.admin_cancel_verified_subscription_request(uuid,text) from public,anon;
grant execute on function private.admin_cancel_verified_subscription_request(uuid,text) to authenticated;
revoke all on function public.admin_cancel_verified_subscription_request(uuid,text) from public,anon;
grant execute on function public.admin_cancel_verified_subscription_request(uuid,text) to authenticated;
