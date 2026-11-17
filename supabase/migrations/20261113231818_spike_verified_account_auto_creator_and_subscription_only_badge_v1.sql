create or replace function public.get_public_profiles(p_user_ids uuid[])
returns table(id uuid, username text, display_name text, avatar_url text, bio text, website text, sp_id text, created_at timestamptz, verified boolean)
language sql stable security definer set search_path to 'pg_catalog','public','private'
as $function$
with me as (select (select auth.uid()) as uid)
select p.id,p.username,p.display_name,p.avatar_url,p.bio,p.website,p.sp_id,p.created_at,
(not private.spike_user_is_restricted(p.id) and exists(
 select 1 from private.spike_verified_subscriptions s join private.spike_verified_identities i on i.user_id=s.user_id
 where s.user_id=p.id and s.status='active' and s.expires_at>now() and i.status='approved'
)) as verified
from public.profiles p cross join me
where me.uid is not null and coalesce(cardinality(p_user_ids),0)<=500
and p.id=any(coalesce(p_user_ids,'{}'::uuid[]))
and (p.id=me.uid or (
 not exists(select 1 from public.private_message_blocks b where
  (b.blocker_id=me.uid and b.blocked_id=p.id) or (b.blocker_id=p.id and b.blocked_id=me.uid))
 and (public.can_view_spike_profile(me.uid,p.id) or exists(
  select 1 from public.private_messages pm where
  (pm.sender_id=me.uid and pm.recipient_id=p.id) or (pm.recipient_id=me.uid and pm.sender_id=p.id)
 ))
));
$function$;

create or replace function public.get_qr_connect_profile(p_user_id uuid)
returns table(id uuid, username text, display_name text, avatar_url text, bio text, website text, sp_id text, created_at timestamptz, verified boolean)
language sql stable security definer set search_path to 'pg_catalog','public','private'
as $function$
select p.id,p.username,p.display_name,p.avatar_url,p.bio,p.website,p.sp_id,p.created_at,
(not private.spike_user_is_restricted(p.id) and exists(
 select 1 from private.spike_verified_subscriptions s join private.spike_verified_identities i on i.user_id=s.user_id
 where s.user_id=p.id and s.status='active' and s.expires_at>now() and i.status='approved'
)) as verified
from public.profiles p
where auth.uid() is not null and p_user_id is not null and p.id=p_user_id and p.id<>auth.uid()
and public.can_discover_spike_profile(auth.uid(),p.id);
$function$;

create or replace function public.spike_my_verified_subscription_status()
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_identity private.spike_verified_identities; v_sub private.spike_verified_subscriptions; v_restricted boolean; v_creator boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 perform private.spike_expire_verified_subscriptions();
 select * into v_identity from private.spike_verified_identities where user_id=auth.uid();
 select * into v_sub from private.spike_verified_subscriptions where user_id=auth.uid() and status='active' and expires_at>now() order by expires_at desc limit 1;
 v_restricted:=private.spike_user_is_restricted(auth.uid());
 v_creator:=v_sub.id is not null and v_identity.status='approved' and not v_restricted;
 return jsonb_build_object(
  'identity_status',coalesce(v_identity.status,'pending'),'identity_reason',v_identity.reason,
  'is_verified',v_creator,'is_creator',v_creator,'creator_status',case when v_creator then 'active' else 'inactive' end,
  'creator_status_source','active_verified_subscription','account_restricted',v_restricted,
  'plan',v_sub.plan,'starts_at',v_sub.starts_at,'expires_at',v_sub.expires_at,'reference',v_sub.reference
 );
end;
$function$;

create or replace function public.spike_creator_wallet_summary()
returns jsonb language plpgsql stable security definer set search_path to 'pg_catalog','public','private'
as $function$
declare
 v_uid uuid:=auth.uid(); v_wallet public.spike_creator_wallets; v_policy public.spike_creator_withdrawal_policy;
 v_elig public.spike_creator_eligibility; v_account public.spike_creator_payout_accounts; v_profile public.profiles;
 v_identity private.spike_verified_identities; v_sub private.spike_verified_subscriptions; v_creator boolean:=false;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
 perform private.spike_expire_verified_subscriptions();
 select * into v_wallet from public.spike_creator_wallets where user_id=v_uid;
 select * into v_policy from public.spike_creator_withdrawal_policy where singleton=true;
 select * into v_elig from public.spike_creator_eligibility where user_id=v_uid;
 select * into v_account from public.spike_creator_payout_accounts where user_id=v_uid;
 select * into v_profile from public.profiles where id=v_uid;
 select * into v_identity from private.spike_verified_identities where user_id=v_uid;
 select * into v_sub from private.spike_verified_subscriptions where user_id=v_uid and status='active' and expires_at>now() order by expires_at desc limit 1;
 v_creator:=v_sub.id is not null and v_identity.status='approved' and not private.spike_user_is_restricted(v_uid);
 return jsonb_build_object(
  'earned_balance',coalesce(v_wallet.earned_balance,0),'reserved_balance',coalesce(v_wallet.reserved_balance,0),
  'available_balance',coalesce(v_wallet.earned_balance,0)-coalesce(v_wallet.reserved_balance,0),
  'withdrawal_enabled',coalesce(v_policy.enabled,false),'minimum_earned_units',v_policy.minimum_earned_units,
  'naira_per_earned_unit',v_policy.naira_per_earned_unit,'fee_bps',v_policy.fee_bps,
  'eligibility_status',coalesce(v_elig.status,'under_review'),'eligibility_requested',v_elig.user_id is not null,
  'eligibility_reason',v_elig.reason,'payout_account_verified',coalesce(v_account.verified,false),
  'payout_bank_name',v_account.bank_name,'has_valid_sp_id',nullif(trim(coalesce(v_profile.sp_id,'')),'') is not null,
  'account_restricted',private.spike_user_is_restricted(v_uid),'is_creator',v_creator,
  'creator_status',case when v_creator then 'active' else 'inactive' end,
  'creator_status_source','active_verified_subscription'
 );
end;
$function$;

revoke all on function public.spike_my_verified_subscription_status() from public, anon;
grant execute on function public.spike_my_verified_subscription_status() to authenticated;
revoke all on function public.spike_creator_wallet_summary() from public, anon;
grant execute on function public.spike_creator_wallet_summary() to authenticated;
