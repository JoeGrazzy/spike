-- SPIKE Admin Control Center completion: privileged user operations, coin grants,
-- announcements, and immutable admin audit records.

create table if not exists public.spike_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  target_type text,
  target_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists spike_admin_audit_created_idx on public.spike_admin_audit_log(created_at desc);
create index if not exists spike_admin_audit_target_idx on public.spike_admin_audit_log(target_type,target_id,created_at desc);
revoke all on public.spike_admin_audit_log from anon, authenticated;

drop function if exists public.admin_grant_coins(uuid,bigint,text);
create function public.admin_grant_coins(p_user_id uuid,p_amount bigint,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid:=auth.uid(); w public.wallets; before_balance bigint; after_balance bigint; clean_reason text;
begin
  if actor is null or not public.is_super_admin(actor) then raise exception 'Super admin access required'; end if;
  if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'SPIKE user not found'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'Coin grant must be between 1 and 1,000,000'; end if;
  clean_reason:=left(nullif(btrim(coalesce(p_reason,'')),''),500);
  select * into w from public.wallets where user_id=p_user_id for update;
  if not found then
    insert into public.wallets(user_id,balance) values(p_user_id,0) returning * into w;
  end if;
  before_balance:=w.balance;
  after_balance:=before_balance+p_amount;
  update public.wallets set balance=after_balance,updated_at=now() where user_id=p_user_id;
  insert into public.coin_ledger(user_id,amount,balance_before,balance_after,transaction_type,reference_id,reason)
  values(p_user_id,p_amount,before_balance,after_balance,'admin_grant',actor::text,coalesce(clean_reason,'Admin coin grant'));
  insert into public.spike_admin_audit_log(actor_id,action,target_type,target_id,reason,before_state,after_state,metadata)
  values(actor,'coin_grant','user',p_user_id,clean_reason,jsonb_build_object('balance',before_balance),jsonb_build_object('balance',after_balance),jsonb_build_object('amount',p_amount));
  return jsonb_build_object('ok',true,'user_id',p_user_id,'amount',p_amount,'balance_before',before_balance,'balance_after',after_balance);
end; $$;
revoke all on function public.admin_grant_coins(uuid,bigint,text) from public,anon;
grant execute on function public.admin_grant_coins(uuid,bigint,text) to authenticated;

drop function if exists public.admin_set_user_activation(uuid,boolean,text);
create function public.admin_set_user_activation(p_user_id uuid,p_activated boolean,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); old_state jsonb; new_state jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then raise exception 'Super admin access required'; end if;
  if p_user_id is null then raise exception 'User is required'; end if;
  select jsonb_build_object('activated',activated) into old_state from public.profiles where id=p_user_id for update;
  if old_state is null then raise exception 'SPIKE user not found'; end if;
  update public.profiles set activated=p_activated,updated_at=now() where id=p_user_id;
  new_state=jsonb_build_object('activated',p_activated);
  insert into public.spike_admin_audit_log(actor_id,action,target_type,target_id,reason,before_state,after_state)
  values(actor,'user_activation','user',p_user_id,left(nullif(btrim(coalesce(p_reason,'')),''),500),old_state,new_state);
  return jsonb_build_object('ok',true,'user_id',p_user_id,'activated',p_activated);
end; $$;
revoke all on function public.admin_set_user_activation(uuid,boolean,text) from public,anon;
grant execute on function public.admin_set_user_activation(uuid,boolean,text) to authenticated;

create table if not exists public.spike_admin_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  severity text not null default 'info' check(severity in ('info','success','warning','critical')),
  audience text not null default 'all' check(audience in ('all','verified','unverified')),
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'scheduled' check(status in ('scheduled','processing','completed','cancelled','expired')),
  delivered_count integer not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index if not exists spike_admin_announcements_status_idx on public.spike_admin_announcements(status,publish_at);
revoke all on public.spike_admin_announcements from anon,authenticated;

create table if not exists public.spike_admin_announcement_recipients (
  campaign_id uuid not null references public.spike_admin_announcements(id) on delete cascade,
  user_id uuid not null,
  delivered_at timestamptz,
  primary key(campaign_id,user_id)
);
create index if not exists spike_admin_ann_recipient_pending_idx on public.spike_admin_announcement_recipients(campaign_id,delivered_at);
revoke all on public.spike_admin_announcement_recipients from anon,authenticated;

create or replace function public.admin_announcement_create(
  p_title text,p_body text,p_audience text default 'all',p_publish_at timestamptz default now(),p_expires_at timestamptz default null,p_severity text default 'info'
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); cid uuid; status_value text;
begin
  if actor is null or not public.is_super_admin(actor) then raise exception 'Super admin access required'; end if;
  if length(btrim(coalesce(p_title,'')))<1 or length(p_title)>180 then raise exception 'Announcement title is required and must be <= 180 characters'; end if;
  if length(btrim(coalesce(p_body,'')))<1 or length(p_body)>5000 then raise exception 'Announcement body is required and must be <= 5000 characters'; end if;
  if p_audience not in ('all','verified','unverified') then raise exception 'Invalid announcement audience'; end if;
  if p_severity not in ('info','success','warning','critical') then raise exception 'Invalid announcement severity'; end if;
  if p_expires_at is not null and p_expires_at<=coalesce(p_publish_at,now()) then raise exception 'Expiration must be after publish time'; end if;
  status_value:=case when coalesce(p_publish_at,now())>now() then 'scheduled' when p_expires_at is not null and p_expires_at<=now() then 'expired' else 'processing' end;
  insert into public.spike_admin_announcements(title,body,audience,publish_at,expires_at,severity,status,created_by,updated_at)
  values(btrim(p_title),btrim(p_body),p_audience,coalesce(p_publish_at,now()),p_expires_at,p_severity,status_value,actor,now()) returning id into cid;
  insert into public.spike_admin_audit_log(actor_id,action,target_type,target_id,after_state)
  values(actor,'announcement_create','announcement',cid,jsonb_build_object('title',btrim(p_title),'audience',p_audience,'publish_at',p_publish_at,'expires_at',p_expires_at));
  return cid;
end; $$;
revoke all on function public.admin_announcement_create(text,text,text,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.admin_announcement_create(text,text,text,timestamptz,timestamptz,text) to authenticated;

create or replace function public.admin_process_scheduled_announcements(p_batch_size integer default 250)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); c record; r record; n integer:=0; lim integer:=greatest(1,least(coalesce(p_batch_size,250),1000));
begin
  if actor is null or not public.is_super_admin(actor) then raise exception 'Super admin access required'; end if;
  for c in select * from public.spike_admin_announcements where status in ('scheduled','processing') and publish_at<=now() order by publish_at limit 50 for update skip locked loop
    if c.expires_at is not null and c.expires_at<=now() then update public.spike_admin_announcements set status='expired',updated_at=now() where id=c.id; continue; end if;
    insert into public.spike_admin_announcement_recipients(campaign_id,user_id)
    select c.id,p.id from public.profiles p
    where p.activated is not false and (c.audience='all' or (c.audience='verified' and p.verified is true) or (c.audience='unverified' and coalesce(p.verified,false) is false))
    on conflict do nothing;
    for r in select user_id from public.spike_admin_announcement_recipients where campaign_id=c.id and delivered_at is null limit lim loop
      insert into public.notifications(user_id,type,data,priority,event_key,group_key,expires_at)
      values(r.user_id,'announcement',jsonb_build_object('campaign_id',c.id,'title',c.title,'body',c.body,'severity',c.severity),'high','admin-announcement:'||c.id::text||':'||r.user_id::text,'admin-announcement:'||c.id::text,c.expires_at)
      on conflict (user_id,event_key) where event_key is not null do nothing;
      update public.spike_admin_announcement_recipients set delivered_at=now() where campaign_id=c.id and user_id=r.user_id and delivered_at is null;
      n:=n+1;
    end loop;
    update public.spike_admin_announcements set delivered_count=(select count(*) from public.spike_admin_announcement_recipients where campaign_id=c.id and delivered_at is not null),status=case when c.expires_at is not null and c.expires_at<=now() then 'expired' when not exists(select 1 from public.spike_admin_announcement_recipients where campaign_id=c.id and delivered_at is null) then 'completed' else 'processing' end,updated_at=now() where id=c.id;
  end loop;
  insert into public.spike_admin_audit_log(actor_id,action,metadata) values(actor,'announcement_process',jsonb_build_object('delivered',n));
  return n;
end; $$;
revoke all on function public.admin_process_scheduled_announcements(integer) from public,anon;
grant execute on function public.admin_process_scheduled_announcements(integer) to authenticated;

create or replace function public.admin_announcement_cancel(p_id uuid,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); old_state jsonb;
begin
  if actor is null or not public.is_super_admin(actor) then raise exception 'Super admin access required'; end if;
  select to_jsonb(a) into old_state from public.spike_admin_announcements a where id=p_id for update;
  if old_state is null then raise exception 'Announcement not found'; end if;
  update public.spike_admin_announcements set status='cancelled',cancelled_at=now(),updated_at=now() where id=p_id and status not in ('completed','cancelled','expired');
  insert into public.spike_admin_audit_log(actor_id,action,target_type,target_id,reason,before_state,after_state)
  values(actor,'announcement_cancel','announcement',p_id,left(nullif(btrim(coalesce(p_reason,'')),''),500),old_state,(select to_jsonb(a) from public.spike_admin_announcements a where a.id=p_id));
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.admin_announcement_cancel(uuid,text) from public,anon;
grant execute on function public.admin_announcement_cancel(uuid,text) to authenticated;

create or replace function public.admin_audit_list(p_limit integer default 100)
returns setof public.spike_admin_audit_log language sql security definer set search_path=public,pg_temp as $$
  select * from public.spike_admin_audit_log where public.admin_guard() order by created_at desc limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.admin_audit_list(integer) from public,anon;
grant execute on function public.admin_audit_list(integer) to authenticated;
