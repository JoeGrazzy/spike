-- Hardening of the owner-only user detail bundle and directory filters.
-- Remove the initial per-section history caps and add report records for hosted rooms/messages.
do $block$
declare d text;
begin
 d:=pg_get_functiondef('private.admin_user_management_bundle(uuid)'::regprocedure);
 d:=replace(d,'limit 100','');
 d:=replace(d,'limit 200','');
 execute d;
end;
$block$;

create or replace function public.admin_list_users_v2(p_search text default '',p_limit integer default 100,p_offset integer default 0,p_filter text default 'all')
returns table(user_id uuid,email text,display_name text,username text,sp_id text,coins bigint,created_at timestamptz,room_count bigint,is_admin boolean,status text,banned_until timestamptz,banned_at timestamptz,banned_by uuid,ban_reason text,last_seen_at timestamptz,providers text[],verified boolean,activated boolean)
language sql stable security definer set search_path='public','auth'
as $function$
 select u.id,u.email,coalesce(p.display_name,u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'full_name'),p.username,p.sp_id,coalesce(w.balance,0)::bigint,coalesce(p.created_at,u.created_at),0::bigint,coalesce(p.role in ('admin','super_admin'),false),
 case when u.deleted_at is not null then 'deleted' when p.id is null then 'profile_missing' when p.restricted_at is not null and (p.restricted_until is null or p.restricted_until>now()) then 'banned' when p.activated=false then 'inactive' else 'active' end,
 p.restricted_until,p.restricted_at,p.restricted_by,p.restriction_reason,(select up.last_seen from public.user_presence up where up.user_id=u.id),
 coalesce((select array_agg(distinct i.provider order by i.provider) from auth.identities i where i.user_id=u.id),'{}'::text[]),coalesce(p.verified,false),coalesce(p.activated,true)
 from auth.users u left join public.profiles p on p.id=u.id left join public.wallets w on w.user_id=u.id
 where public.admin_guard() and u.deleted_at is null
 and (coalesce(trim(p_search),'')='' or coalesce(p.display_name,'') ilike '%'||trim(p_search)||'%' or coalesce(p.username,'') ilike '%'||ltrim(trim(p_search),'@')||'%' or coalesce(p.sp_id,'') ilike '%'||trim(p_search)||'%' or coalesce(u.email,'') ilike '%'||trim(p_search)||'%' or u.id::text ilike '%'||trim(p_search)||'%' or exists(select 1 from auth.identities si where si.user_id=u.id and si.provider ilike '%'||trim(p_search)||'%'))
 and (coalesce(lower(p_filter),'all')='all'
  or (lower(p_filter)='active' and p.activated=true and not (p.restricted_at is not null and (p.restricted_until is null or p.restricted_until>now())))
  or (lower(p_filter)='inactive' and p.activated=false)
  or (lower(p_filter)='banned' and p.restricted_at is not null and (p.restricted_until is null or p.restricted_until>now()))
  or (lower(p_filter)='verified' and p.verified=true)
  or (lower(p_filter)='unverified' and coalesce(p.verified,false)=false)
  or (lower(p_filter)='admin' and p.role in ('admin','super_admin'))
  or (lower(p_filter)='profile_missing' and p.id is null))
 order by coalesce(p.created_at,u.created_at) desc limit greatest(1,least(coalesce(p_limit,100),500)) offset greatest(0,coalesce(p_offset,0));
$function$;

create or replace function private.admin_user_delete_preflight(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_fk record; v_count bigint; v_fk_blockers jsonb:='[]'::jsonb; v_financial jsonb:='[]'::jsonb; v_item record;
begin
 if auth.uid() is null or not private.spike_is_owner() then raise exception 'SPIKE owner access required' using errcode='42501'; end if;
 if p_user_id is null or not exists(select 1 from auth.users u where u.id=p_user_id and u.deleted_at is null) then raise exception 'User not found'; end if;
 for v_fk in select c.conrelid::regclass::text table_name,string_agg(format('%I = $1',a.attname),' and ') predicate from pg_constraint c join lateral unnest(c.conkey,c.confkey) k(attnum,confattnum) on true join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum join pg_attribute ta on ta.attrelid=c.confrelid and ta.attnum=k.confattnum where c.contype='f' and c.confdeltype in ('a','r') and c.confrelid in ('auth.users'::regclass,'public.profiles'::regclass) and ta.attname='id' group by c.oid,c.conrelid loop
  execute format('select count(*) from %s where %s',v_fk.table_name,v_fk.predicate) into v_count using p_user_id;
  if v_count>0 then v_fk_blockers:=v_fk_blockers||jsonb_build_array(jsonb_build_object('table',v_fk.table_name,'rows',v_count)); end if;
 end loop;
 for v_item in select * from (values ('public.wallets','user_id','balance > 0'),('public.coin_ledger','user_id','true'),('public.coin_orders','user_id','true'),('public.coin_transactions','user_id','true'),('public.gem_transactions','user_id','true'),('public.gift_history','sender_id','true'),('public.gift_history','receiver_id','true'),('public.spike_room_gift_transactions','sender_id','true'),('public.spike_room_gift_transactions','receiver_id','true'),('public.spike_live_audio_gift_transactions','sender_id','true'),('public.spike_live_audio_gift_transactions','room_owner_id','true'),('public.spike_live_audio_gift_transactions','broadcaster_id','true'),('public.spike_creator_earnings_ledger','user_id','true'),('public.spike_creator_wallets','user_id','true'),('public.spike_creator_withdrawals','user_id','true'),('public.spike_creator_payout_accounts','user_id','true'),('public.spike_payout_accounts','user_id','true'),('public.monthly_payouts','user_id','true'),('public.spike_revenue','user_id','true'),('public.spike_room_message_rewards','sender_id','true'),('public.spike_room_message_rewards','receiver_id','true'),('public.spike_coin_source_balances','user_id','paid_balance > 0 or bonus_balance > 0'),('private.spike_verified_subscriptions','user_id','true')) x(table_name,column_name,condition) loop
  if to_regclass(v_item.table_name) is not null then execute format('select count(*) from %s where %I=$1 and (%s)',v_item.table_name,v_item.column_name,v_item.condition) into v_count using p_user_id; if v_count>0 then v_financial:=v_financial||jsonb_build_array(jsonb_build_object('table',v_item.table_name,'rows',v_count)); end if; end if;
 end loop;
 if to_regclass('storage.objects') is not null then execute 'select count(*) from storage.objects where owner=$1 or owner_id=$1::text' into v_count using p_user_id; if v_count>0 then v_financial:=v_financial||jsonb_build_array(jsonb_build_object('table','storage.objects','rows',v_count)); end if; end if;
 return jsonb_build_object('user_id',p_user_id,'allowed',jsonb_array_length(v_fk_blockers)=0 and jsonb_array_length(v_financial)=0,'foreign_key_blockers',v_fk_blockers,'financial_history',v_financial,'message',case when jsonb_array_length(v_financial)>0 then 'Deletion is blocked because this account has financial, gift, subscription or storage history that must be retained.' when jsonb_array_length(v_fk_blockers)>0 then 'Deletion is blocked by linked records that must be resolved or retained.' else 'Preflight passed. Permanent deletion will remove the account and remaining cascading personal records.' end);
end;
$function$;
