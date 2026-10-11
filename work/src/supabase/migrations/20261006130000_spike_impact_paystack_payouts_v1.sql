-- Additive SPIKE Impact Paystack collection and creator payout ledger.
-- Do not alter Coffee payment objects. Deploy only after Paystack account/use-case approval.
alter table public.spike_impact_donations alter column transfer_reference drop not null;
alter table public.spike_impact_donations
  add column if not exists currency text not null default 'NGN',
  add column if not exists payment_provider text,
  add column if not exists payment_reference text,
  add column if not exists paystack_access_code text,
  add column if not exists gross_amount_kobo bigint,
  add column if not exists platform_fee numeric(12,2),
  add column if not exists payout_net numeric(12,2),
  add column if not exists payment_status text not null default 'manual_pending',
  add column if not exists paid_at timestamptz;
create unique index if not exists spike_impact_donations_payment_ref_unique
  on public.spike_impact_donations(payment_reference) where payment_reference is not null;
create index if not exists spike_impact_donations_donor_idx on public.spike_impact_donations(donor_id,submitted_at desc);

-- Private creator payout details are never returned by the public campaign-list RPC.
create table if not exists public.spike_impact_payout_accounts (
  creator_id uuid primary key references public.profiles(id) on delete cascade,
  bank_code text not null,
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  paystack_recipient_code text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.spike_impact_payout_requests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  amount_gross numeric(12,2) not null check (amount_gross > 0),
  platform_fee numeric(12,2) not null check (platform_fee >= 0),
  payout_amount numeric(12,2) not null check (payout_amount >= 0),
  currency text not null default 'NGN' check (currency='NGN'),
  status text not null default 'pending' check (status in ('pending','processing','paid','rejected','failed')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  transfer_reference text unique,
  review_note text
);
create index if not exists spike_impact_payout_requests_creator_idx on public.spike_impact_payout_requests(creator_id,requested_at desc);
revoke all on public.spike_impact_payout_accounts, public.spike_impact_payout_requests from public,anon,authenticated;

-- New payment initialization records are pending and never count toward campaign progress.
create or replace function public.spike_impact_payment_prepare(p_campaign_id uuid,p_amount numeric,p_reference text,p_access_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); did uuid; fee numeric(12,2); net numeric(12,2);
begin
 if uid is null then raise exception 'Sign in to donate'; end if;
 if p_amount is null or p_amount < 100 or p_amount > 100000000 then raise exception 'Donation must be between ₦100 and ₦100,000,000'; end if;
 if nullif(trim(coalesce(p_reference,'')),'') is null then raise exception 'Payment reference is required'; end if;
 if not exists(select 1 from public.spike_impact_campaigns where id=p_campaign_id and status='published' and help_type='money') then raise exception 'Campaign unavailable'; end if;
 fee:=round(p_amount*0.10,2); net:=round(p_amount-fee,2);
 insert into public.spike_impact_donations(campaign_id,donor_id,amount,transfer_reference,status,currency,payment_provider,payment_reference,paystack_access_code,gross_amount_kobo,platform_fee,payout_net,payment_status)
 values(p_campaign_id,uid,p_amount,null,'pending','NGN','paystack',p_reference,p_access_code,round(p_amount*100),fee,net,'initialized') returning id into did;
 return jsonb_build_object('ok',true,'donation_id',did,'reference',p_reference,'status','pending');
end $$;
revoke all on function public.spike_impact_payment_prepare(uuid,numeric,text,text) from public,anon;
grant execute on function public.spike_impact_payment_prepare(uuid,numeric,text,text) to authenticated;

-- Only trusted service-role webhook/reconciliation may confirm a payment.
create or replace function public.spike_impact_payment_confirm(p_reference text,p_verified_amount_kobo bigint,p_currency text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.spike_impact_donations%rowtype; creator uuid; campaign_title text;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;
 select * into d from public.spike_impact_donations where payment_reference=p_reference for update;
 if not found then raise exception 'Donation reference not found'; end if;
 if d.payment_status='verified' and d.status='verified' then return jsonb_build_object('ok',true,'duplicate',true,'status','verified'); end if;
 if p_currency <> 'NGN' or p_verified_amount_kobo <> d.gross_amount_kobo then
   update public.spike_impact_donations set payment_status='mismatch',verification_note=left(coalesce(p_note,'Amount or currency mismatch'),500) where id=d.id;
   return jsonb_build_object('ok',false,'status','mismatch');
 end if;
 update public.spike_impact_donations set status='verified',payment_status='verified',verified_at=now(),paid_at=now(),verification_note=left(coalesce(p_note,'Paystack verified'),500) where id=d.id;
 select c.creator_id,c.title into creator,campaign_title from public.spike_impact_campaigns c where c.id=d.campaign_id;
 insert into public.notifications(user_id,type,data,priority,event_key,group_key) values(creator,'spike_impact_donation_received',jsonb_build_object('campaign_id',d.campaign_id,'campaign_title',campaign_title,'amount',d.amount,'currency','NGN','reference',p_reference),'normal','spike_impact_donation:'||d.id::text,'spike_impact_campaign:'||d.campaign_id::text) on conflict (user_id,event_key) where event_key is not null do nothing;
 return jsonb_build_object('ok',true,'status','verified','donation_id',d.id);
end $$;
revoke all on function public.spike_impact_payment_confirm(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.spike_impact_payment_confirm(text,bigint,text,text) to service_role;

-- Private creator dashboard. Available balance excludes amounts already requested for payout.
create or replace function public.spike_impact_creator_financials()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); total numeric(12,2); requested numeric(12,2); out jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 select coalesce(sum(d.amount),0) into total from public.spike_impact_donations d join public.spike_impact_campaigns c on c.id=d.campaign_id where c.creator_id=uid and d.status='verified';
 select coalesce(sum(amount_gross),0) into requested from public.spike_impact_payout_requests where creator_id=uid and status in ('pending','processing','paid');
 select jsonb_build_object('gross_verified',total,'fee_at_10_percent',round(total*0.10,2),'gross_already_requested_or_paid',requested,'available_gross',greatest(0,total-requested),'estimated_payout',round(greatest(0,total-requested)*0.90,2),'payout_account_added',exists(select 1 from public.spike_impact_payout_accounts where creator_id=uid and verified_at is not null)) into out;
 return out;
end $$;
revoke all on function public.spike_impact_creator_financials() from public,anon;
grant execute on function public.spike_impact_creator_financials() to authenticated;

-- Remove legacy public bank-account fields from campaign listing and stop requiring campaign-level bank details.
create or replace function public.spike_impact_campaigns_list()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); out jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into out from (
  select c.id,c.creator_id,c.category,c.title,c.story,c.help_type,c.goal_amount,c.goal_quantity,c.location_text,c.image_url,c.status,c.created_at,
   p.display_name creator_name,p.username creator_username,p.avatar_url creator_avatar,p.verified creator_verified,(c.creator_id=uid) is_owner,
   coalesce((select sum(d.amount) from public.spike_impact_donations d where d.campaign_id=c.id and d.status='verified'),0) verified_amount
  from public.spike_impact_campaigns c join public.profiles p on p.id=c.creator_id where c.status='published' limit 100
 ) x; return out;
end $$;

create or replace function public.spike_impact_campaign_create_v2(
 p_category text,p_title text,p_story text,p_help_type text,p_goal_amount numeric default null,
 p_goal_quantity integer default null,p_location_text text default null,p_image_url text default null,
 p_bank_name text default null,p_account_name text default null,p_account_number text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); cid uuid; verified_user boolean;
begin
 if uid is null then raise exception 'Please sign in to publish an Impact campaign'; end if;
 select coalesce(verified,false) into verified_user from public.profiles where id=uid;
 if not coalesce(verified_user,false) then raise exception 'Only SPIKE Verified Badge users can publish Impact campaigns'; end if;
 if char_length(trim(coalesce(p_title,''))) not between 8 and 140 then raise exception 'Give the campaign a clear title (8–140 characters)'; end if;
 if char_length(trim(coalesce(p_story,''))) not between 30 and 5000 then raise exception 'Tell people clearly what help is needed (30–5000 characters)'; end if;
 if p_help_type not in ('money','items','services','volunteers','other') then raise exception 'Choose a valid way people can help'; end if;
 if coalesce(p_goal_amount,0)<=0 and coalesce(p_goal_quantity,0)<=0 then raise exception 'Add a target amount or quantity'; end if;
 insert into public.spike_impact_campaigns(creator_id,category,title,story,help_type,goal_amount,goal_quantity,location_text,image_url)
 values(uid,coalesce(nullif(trim(p_category),''),'community'),trim(p_title),trim(p_story),p_help_type,
 case when p_goal_amount>0 then round(p_goal_amount,2) else null end,
 case when p_goal_quantity>0 then least(p_goal_quantity,1000000) else null end,
 nullif(trim(coalesce(p_location_text,'')),''),nullif(trim(coalesce(p_image_url,'')),'')) returning id into cid;
 return jsonb_build_object('ok',true,'campaign_id',cid);
end $$;

-- Atomic payout reservation: serializes requests per creator to prevent concurrent double-withdrawal.
create or replace function public.spike_impact_payout_request_create(p_creator_id uuid,p_amount_gross numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare total numeric(12,2); reserved numeric(12,2); fee numeric(12,2); net numeric(12,2); pid uuid;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;
 if p_amount_gross is null or p_amount_gross<=0 or p_amount_gross<>round(p_amount_gross,2) then raise exception 'Invalid payout amount'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_creator_id::text,0));
 if not exists(select 1 from public.profiles where id=p_creator_id and verified=true) then raise exception 'Verified creator required'; end if;
 if not exists(select 1 from public.spike_impact_payout_accounts where creator_id=p_creator_id and verified_at is not null) then raise exception 'Verified payout account required'; end if;
 select coalesce(sum(d.amount),0) into total from public.spike_impact_donations d join public.spike_impact_campaigns c on c.id=d.campaign_id where c.creator_id=p_creator_id and d.status='verified';
 select coalesce(sum(amount_gross),0) into reserved from public.spike_impact_payout_requests where creator_id=p_creator_id and status in ('pending','processing','paid');
 if p_amount_gross>greatest(0,total-reserved) then raise exception 'Payout exceeds available verified donations'; end if;
 fee:=round(p_amount_gross*0.10,2); net:=round(p_amount_gross-fee,2);
 insert into public.spike_impact_payout_requests(creator_id,amount_gross,platform_fee,payout_amount,currency)
 values(p_creator_id,p_amount_gross,fee,net,'NGN') returning id into pid;
 return jsonb_build_object('ok',true,'payout',jsonb_build_object('id',pid,'amount_gross',p_amount_gross,'platform_fee',fee,'payout_amount',net,'status','pending'));
end $$;
revoke all on function public.spike_impact_payout_request_create(uuid,numeric) from public,anon,authenticated;
grant execute on function public.spike_impact_payout_request_create(uuid,numeric) to service_role;

-- Operations reconciliation endpoint for an authorized server after an actual bank transfer.
create or replace function public.spike_impact_payout_review(p_payout_id uuid,p_status text,p_transfer_reference text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;
 if p_status not in ('processing','paid','rejected','failed') then raise exception 'Invalid payout status'; end if;
 if p_status='paid' and nullif(trim(coalesce(p_transfer_reference,'')),'') is null then raise exception 'Transfer reference required for paid payouts'; end if;
 update public.spike_impact_payout_requests set status=p_status,processed_at=case when p_status in ('paid','rejected','failed') then now() else processed_at end,
 transfer_reference=case when p_status='paid' then trim(p_transfer_reference) else transfer_reference end,
 review_note=left(nullif(trim(coalesce(p_note,'')),''),500)
 where id=p_payout_id and status in ('pending','processing');
 if not found then raise exception 'Pending payout request not found'; end if;
 return jsonb_build_object('ok',true,'status',p_status);
end $$;
revoke all on function public.spike_impact_payout_review(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.spike_impact_payout_review(uuid,text,text,text) to service_role;
