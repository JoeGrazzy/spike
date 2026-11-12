-- SPIKE Impact manual-transfer donations. Additive migration; existing mission objects remain untouched.
-- Progress includes only donations confirmed by a trusted server-side reconciliation process.
alter table public.spike_impact_campaigns
  add column if not exists bank_name text,
  add column if not exists account_name text,
  add column if not exists account_number text;

create table if not exists public.spike_impact_donations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.spike_impact_campaigns(id) on delete cascade,
  donor_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  transfer_reference text not null check (char_length(trim(transfer_reference)) between 3 and 180),
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  verification_note text,
  constraint spike_impact_donation_verified_fields check ((status <> 'verified') or verified_at is not null)
);
create unique index if not exists spike_impact_donation_reference_unique
  on public.spike_impact_donations (lower(transfer_reference));
create index if not exists spike_impact_donation_campaign_status_idx
  on public.spike_impact_donations (campaign_id,status);
revoke all on public.spike_impact_donations from public,anon,authenticated;

create or replace function public.spike_impact_campaigns_list()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid := auth.uid(); out jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into out
 from (
  select c.id,c.creator_id,c.category,c.title,c.story,c.help_type,c.goal_amount,c.goal_quantity,
   c.location_text,c.image_url,c.status,c.created_at,c.bank_name,c.account_name,c.account_number,
   p.display_name creator_name,p.username creator_username,p.avatar_url creator_avatar,p.verified creator_verified,
   (c.creator_id=uid) is_owner,
   coalesce((select sum(d.amount) from public.spike_impact_donations d where d.campaign_id=c.id and d.status='verified'),0) verified_amount
  from public.spike_impact_campaigns c join public.profiles p on p.id=c.creator_id
  where c.status='published' limit 100
 ) x;
 return out;
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
 if p_help_type='money' and (nullif(trim(coalesce(p_bank_name,'')),'') is null or nullif(trim(coalesce(p_account_name,'')),'') is null or nullif(trim(coalesce(p_account_number,'')),'') is null) then raise exception 'Add bank name, account name, and account number for money campaigns'; end if;
 insert into public.spike_impact_campaigns(creator_id,category,title,story,help_type,goal_amount,goal_quantity,location_text,image_url,bank_name,account_name,account_number)
 values(uid,coalesce(nullif(trim(p_category),''),'community'),trim(p_title),trim(p_story),p_help_type,
 case when p_goal_amount>0 then round(p_goal_amount,2) else null end,
 case when p_goal_quantity>0 then least(p_goal_quantity,1000000) else null end,
 nullif(trim(coalesce(p_location_text,'')),''),nullif(trim(coalesce(p_image_url,'')),''),
 nullif(trim(coalesce(p_bank_name,'')),''),nullif(trim(coalesce(p_account_name,'')),''),nullif(trim(coalesce(p_account_number,'')),'')) returning id into cid;
 return jsonb_build_object('ok',true,'campaign_id',cid);
end $$;

create or replace function public.spike_impact_donation_submit(p_campaign_id uuid,p_amount numeric,p_transfer_reference text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); did uuid;
begin
 if uid is null then raise exception 'Sign in to submit a donation'; end if;
 if p_amount is null or p_amount<=0 or p_amount>1000000000 then raise exception 'Enter a valid donation amount'; end if;
 if char_length(trim(coalesce(p_transfer_reference,''))) not between 3 and 180 then raise exception 'Enter the bank transfer reference'; end if;
 if not exists(select 1 from public.spike_impact_campaigns where id=p_campaign_id and status='published' and help_type='money') then raise exception 'This money campaign is unavailable'; end if;
 insert into public.spike_impact_donations(campaign_id,donor_id,amount,transfer_reference)
 values(p_campaign_id,uid,round(p_amount,2),trim(p_transfer_reference)) returning id into did;
 return jsonb_build_object('ok',true,'donation_id',did,'status','pending');
end $$;

-- Only a trusted server using the service role may mark a donation verified/rejected.
create or replace function public.spike_impact_donation_review(p_donation_id uuid,p_status text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Only authorized payment reconciliation can verify donations'; end if;
 if p_status not in ('verified','rejected') then raise exception 'Invalid review status'; end if;
 update public.spike_impact_donations set status=p_status,verified_at=case when p_status='verified' then now() else null end,
 verification_note=nullif(left(trim(coalesce(p_note,'')),500),'' ) where id=p_donation_id and status='pending';
 if not found then raise exception 'Pending donation not found'; end if;
 return jsonb_build_object('ok',true,'status',p_status);
end $$;

revoke all on function public.spike_impact_campaigns_list() from public,anon;
grant execute on function public.spike_impact_campaigns_list() to authenticated;
revoke all on function public.spike_impact_campaign_create_v2(text,text,text,text,numeric,integer,text,text,text,text,text) from public,anon;
grant execute on function public.spike_impact_campaign_create_v2(text,text,text,text,numeric,integer,text,text,text,text,text) to authenticated;
revoke all on function public.spike_impact_donation_submit(uuid,numeric,text) from public,anon;
grant execute on function public.spike_impact_donation_submit(uuid,numeric,text) to authenticated;
revoke all on function public.spike_impact_donation_review(uuid,text,text) from public,anon,authenticated;
grant execute on function public.spike_impact_donation_review(uuid,text,text) to service_role;
