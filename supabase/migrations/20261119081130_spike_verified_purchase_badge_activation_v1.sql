-- SPIKE: activating a verified subscription must also activate the profile badge.
-- The wallet independently checks the subscription validity window before showing the badge.
create or replace function public.spike_admin_approve_purchase(p_order_id uuid, p_payment_reference text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'auth', 'private'
as $function$
declare
  v_order public.spike_purchase_orders%rowtype;
  v_payment_ref text := nullif(btrim(p_payment_reference),'');
  v_now timestamptz := now();
  v_valid_from timestamptz;
  v_valid_until timestamptz;
begin
  if not private.is_admin() then raise exception 'Only the SPIKE owner can approve payments.'; end if;
  if p_order_id is null or v_payment_ref is null or char_length(v_payment_ref) > 120 then
    raise exception 'A valid bank transaction reference is required.';
  end if;

  select * into v_order from public.spike_purchase_orders where id=p_order_id for update;
  if not found then raise exception 'Purchase request not found.'; end if;
  if v_order.status='approved' then
    if lower(coalesce(v_order.payment_reference,''))=lower(v_payment_ref) then
      return jsonb_build_object('ok',true,'already_approved',true,'status','approved','order_reference',v_order.order_reference);
    end if;
    raise exception 'This purchase request has already been approved with another bank reference.';
  end if;
  if v_order.status <> 'payment_reported' then
    raise exception 'Customer must report payment before owner approval.';
  end if;
  if exists(select 1 from public.spike_purchase_orders
            where lower(payment_reference)=lower(v_payment_ref) and id<>v_order.id) then
    raise exception 'This bank transaction reference has already been used.';
  end if;

  if v_order.product_type='coin' then
    if coalesce(v_order.coin_amount,0) <= 0 then raise exception 'Coin amount is not configured for this order.'; end if;
    insert into public.wallet_accounts(user_id,currency,available_balance,pending_balance)
      values(v_order.user_id,'SPIKE_COIN',0,0)
      on conflict(user_id) do nothing;
    update public.wallet_accounts
      set available_balance=available_balance+v_order.coin_amount,updated_at=v_now
      where user_id=v_order.user_id;
    insert into public.wallet_ledger(user_id,entry_type,amount,currency,reference,description,status)
      values(v_order.user_id,'credit',v_order.coin_amount,'SPIKE_COIN',
        'spike_purchase_order:'||v_order.id::text,
        'Approved SP Coin purchase · '||v_order.order_reference,'posted');
  elsif v_order.product_type='verified' then
    v_valid_from := v_now;
    select greatest(coalesce(valid_until,v_now),v_now) into v_valid_from
      from public.spike_verified_subscriptions where user_id=v_order.user_id for update;
    v_valid_from := coalesce(v_valid_from,v_now);
    v_valid_until := v_valid_from + make_interval(days=>v_order.duration_days);
    insert into public.spike_verified_subscriptions(user_id,plan_sku,status,starts_at,valid_until,last_order_id,updated_at)
      values(v_order.user_id,v_order.sku,'active',v_now,v_valid_until,v_order.id,v_now)
    on conflict(user_id) do update set plan_sku=excluded.plan_sku,status='active',
      starts_at=case when public.spike_verified_subscriptions.valid_until>v_now
                     then public.spike_verified_subscriptions.starts_at else v_now end,
      valid_until=excluded.valid_until,last_order_id=excluded.last_order_id,updated_at=v_now;
    -- Keep the profile projection in sync in the same transaction as subscription activation.
    update public.profiles set is_verified=true,updated_at=v_now where id=v_order.user_id;
  else
    raise exception 'Unsupported purchase type.';
  end if;

  update public.spike_purchase_orders set status='approved',payment_reference=v_payment_ref,
    reviewed_by=auth.uid(),reviewed_at=v_now,updated_at=v_now
    where id=v_order.id returning * into v_order;
  insert into public.spike_purchase_events(order_id,actor_id,event_type,details)
  values(v_order.id,auth.uid(),'approved',jsonb_build_object('payment_reference',v_payment_ref,'product_type',v_order.product_type));
  return jsonb_build_object('ok',true,'status',v_order.status,'order_reference',v_order.order_reference);
end;
$function$;
