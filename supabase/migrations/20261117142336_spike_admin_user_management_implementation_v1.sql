-- SPIKE Admin User Management v1
-- Owner-only read model, private administrator notes, and safe-delete preflight.

create table if not exists public.spike_admin_user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  note text not null check (length(trim(note)) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists spike_admin_user_notes_user_created_idx
  on public.spike_admin_user_notes(user_id, created_at desc);

alter table public.spike_admin_user_notes enable row level security;
revoke all on public.spike_admin_user_notes from public, anon, authenticated;
grant all on public.spike_admin_user_notes to service_role;

create or replace function private.admin_user_management_bundle(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not private.spike_is_owner() then
    raise exception 'SPIKE owner access required' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id and u.deleted_at is null) then
    raise exception 'User not found';
  end if;

  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'user_id', p.id, 'full_name', p.full_name, 'display_name', p.display_name,
        'username', p.username, 'sp_id', p.sp_id, 'avatar_url', p.avatar_url,
        'bio', p.bio, 'role', p.role, 'activated', p.activated,
        'verified', coalesce(p.verified, false), 'created_at', p.created_at,
        'updated_at', p.updated_at, 'last_activity_at', p.last_activity_at,
        'restricted_until', p.restricted_until, 'restricted_at', p.restricted_at,
        'restricted_by', p.restricted_by, 'restriction_reason', p.restriction_reason
      ) from public.profiles p where p.id = p_user_id
    ),
    'last_active_at', coalesce(
      (select up.last_seen from public.user_presence up where up.user_id = p_user_id),
      (select p.last_activity_at from public.profiles p where p.id = p_user_id)
    ),
    'presence', (
      select to_jsonb(up) from public.user_presence up where up.user_id = p_user_id
    ),
    'verification', jsonb_build_object(
      'profile_verified', coalesce((select p.verified from public.profiles p where p.id = p_user_id), false),
      'identity_requests', coalesce((select jsonb_agg(jsonb_build_object('status', vi.status, 'reason', vi.reason, 'reviewed_at', vi.reviewed_at, 'updated_at', vi.updated_at) order by vi.updated_at desc) from private.spike_verified_identities vi where vi.user_id = p_user_id), '[]'::jsonb)
    ),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'plan', s.plan, 'status', s.status, 'payment_status', s.payment_status, 'amount_minor', s.amount_minor, 'currency', s.currency, 'starts_at', s.starts_at, 'expires_at', s.expires_at, 'created_at', s.created_at, 'updated_at', s.updated_at) order by s.created_at desc)
      from private.spike_verified_subscriptions s where s.user_id = p_user_id
    ), '[]'::jsonb),
    'wallet', jsonb_build_object(
      'balance', coalesce((select w.balance from public.wallets w where w.user_id = p_user_id), 0),
      'updated_at', (select w.updated_at from public.wallets w where w.user_id = p_user_id),
      'paid_balance', coalesce((select b.paid_balance from public.spike_coin_source_balances b where b.user_id = p_user_id), 0),
      'bonus_balance', coalesce((select b.bonus_balance from public.spike_coin_source_balances b where b.user_id = p_user_id), 0)
    ),
    'coin_history', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'amount', l.amount, 'transaction_type', l.transaction_type, 'reason', l.reason, 'paid_amount', l.paid_amount, 'bonus_amount', l.bonus_amount, 'created_at', l.created_at) order by l.created_at desc)
      from (select * from public.coin_ledger where user_id = p_user_id order by created_at desc limit 100) l
    ), '[]'::jsonb),
    'gifts', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'direction', case when g.sender_id = p_user_id then 'sent' else 'received' end, 'sender_id', g.sender_id, 'receiver_id', g.receiver_id, 'gift_type', g.gift_type, 'coin_cost', g.coin_cost, 'gems_earned', g.gems_earned, 'created_at', g.created_at) order by g.created_at desc)
      from (select * from public.gift_history where sender_id = p_user_id or receiver_id = p_user_id order by created_at desc limit 100) g
    ), '[]'::jsonb),
    'earnings', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'amount_units', e.amount_units, 'gross_amount_units', e.gross_amount_units, 'platform_share_units', e.platform_share_units, 'source_type', e.source_type, 'description', e.description, 'created_at', e.created_at) order by e.created_at desc)
      from (select * from public.spike_creator_earnings_ledger where user_id = p_user_id order by created_at desc limit 100) e
    ), '[]'::jsonb),
    'creator_wallet', (select jsonb_build_object('earned_balance', cw.earned_balance, 'reserved_balance', cw.reserved_balance, 'updated_at', cw.updated_at) from public.spike_creator_wallets cw where cw.user_id = p_user_id),
    'withdrawals', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'reference', w.reference, 'earned_units', w.earned_units, 'gross_amount_minor', w.gross_amount_minor, 'fee_amount_minor', w.fee_amount_minor, 'net_amount_minor', w.net_amount_minor, 'currency', w.currency, 'status', w.status, 'created_at', w.created_at, 'decided_at', w.decided_at, 'paid_at', w.paid_at) order by w.created_at desc)
      from (select * from public.spike_creator_withdrawals where user_id = p_user_id order by created_at desc limit 100) w
    ), '[]'::jsonb),
    'referral_code', (select rc.code from private.spike_referral_codes rc where rc.user_id = p_user_id),
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'direction', case when r.referrer_id = p_user_id then 'invited' else 'referred_by' end, 'referrer_id', r.referrer_id, 'referred_id', r.referred_id, 'status', r.status, 'bonus_gems', r.bonus_gems, 'created_at', r.created_at) order by r.created_at desc)
      from (select * from public.referrals where referrer_id = p_user_id or referred_id = p_user_id order by created_at desc limit 100) r
    ), '[]'::jsonb),
    'referral_attributions', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'direction', case when a.inviter_id = p_user_id then 'invited' else 'referred_by' end, 'inviter_id', a.inviter_id, 'invitee_id', a.invitee_id, 'referral_code', a.referral_code, 'status', a.status, 'qualified_at', a.qualified_at, 'points_awarded', a.points_awarded, 'rejection_reason', a.rejection_reason, 'created_at', a.created_at) order by a.created_at desc)
      from (select * from private.spike_referral_attributions where inviter_id = p_user_id or invitee_id = p_user_id order by created_at desc limit 100) a
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(x.item order by (x.item->>'activity_at') desc)
      from (
        select jsonb_build_object('kind', 'membership', 'room_id', m.room_id, 'room_title', r.title, 'room_status', r.status, 'role', m.role, 'member_state', m.member_state, 'joined_at', m.joined_at, 'left_at', m.left_at, 'activity_at', coalesce(m.left_at,m.updated_at,m.joined_at)) item
        from public.spike_room_members m left join public.spike_rooms r on r.id = m.room_id where m.user_id = p_user_id
        union all
        select jsonb_build_object('kind', 'hosted', 'room_id', r.id, 'room_title', r.title, 'room_status', r.status, 'role', 'host', 'started_at', r.started_at, 'ended_at', r.ended_at, 'activity_at', coalesce(r.ended_at,r.updated_at,r.created_at)) item
        from public.spike_rooms r where r.host_id = p_user_id
      ) x
    ), '[]'::jsonb),
    'reports', jsonb_build_object(
      'profile_reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'reporter_id', r.reporter_id, 'created_at', r.created_at) order by r.created_at desc) from public.profile_reports r where r.reported_user_id = p_user_id), '[]'::jsonb),
      'abuse_cases', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'source', a.source, 'category', a.category, 'details', a.details, 'status', a.status, 'severity', a.severity, 'resolution', a.resolution, 'created_at', a.created_at, 'updated_at', a.updated_at) order by a.created_at desc) from public.spike_abuse_cases a where a.subject_user_id = p_user_id), '[]'::jsonb),
      'support_cases', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'category', s.category, 'subject', s.subject, 'status', s.status, 'priority', s.priority, 'created_at', s.created_at, 'updated_at', s.updated_at) order by s.created_at desc) from public.spike_support_cases s where s.user_id = p_user_id), '[]'::jsonb)
    ),
    'activity', coalesce((
      select jsonb_agg(a.item order by a.at desc)
      from (
        select jsonb_build_object('type','event','title',e.event_name,'detail',e.page,'created_at',e.created_at) item,e.created_at at from public.spike_event_log e where e.user_id=p_user_id
        union all
        select jsonb_build_object('type','coin','title',l.transaction_type,'detail',l.reason,'amount',l.amount,'created_at',l.created_at),l.created_at from public.coin_ledger l where l.user_id=p_user_id
        union all
        select jsonb_build_object('type','gift','title',g.gift_type,'detail',case when g.sender_id=p_user_id then 'Gift sent' else 'Gift received' end,'created_at',g.created_at),g.created_at from public.gift_history g where g.sender_id=p_user_id or g.receiver_id=p_user_id
        union all
        select jsonb_build_object('type','earning','title',e.source_type,'detail',e.description,'amount_units',e.amount_units,'created_at',e.created_at),e.created_at from public.spike_creator_earnings_ledger e where e.user_id=p_user_id
        union all
        select jsonb_build_object('type','room','title',r.title,'detail',m.role||' · '||m.member_state,'created_at',coalesce(m.left_at,m.updated_at,m.joined_at)),coalesce(m.left_at,m.updated_at,m.joined_at) from public.spike_room_members m join public.spike_rooms r on r.id=m.room_id where m.user_id=p_user_id
        union all
        select jsonb_build_object('type','referral','title','Referral activity','detail',a.status,'created_at',a.created_at),a.created_at from private.spike_referral_attributions a where a.inviter_id=p_user_id or a.invitee_id=p_user_id
        union all
        select jsonb_build_object('type','support','title',s.subject,'detail',s.status,'created_at',s.created_at),s.created_at from public.spike_support_cases s where s.user_id=p_user_id
        union all
        select jsonb_build_object('type','admin','title',a.action,'detail',a.details,'created_at',a.created_at),a.created_at from public.admin_audit a where a.target_user_id=p_user_id
      ) a
      order by a.at desc limit 200
    ), '[]'::jsonb)
  ) into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$function$;

create or replace function public.admin_user_management_bundle(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.admin_user_management_bundle(p_user_id);
$function$;

grant usage on schema private to authenticated;
grant execute on function private.admin_user_management_bundle(uuid) to authenticated;
grant execute on function public.admin_user_management_bundle(uuid) to authenticated;
revoke execute on function public.admin_user_management_bundle(uuid) from anon, public;

create or replace function private.admin_user_delete_preflight(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_fk record;
  v_count bigint;
  v_fk_blockers jsonb := '[]'::jsonb;
  v_financial jsonb := '[]'::jsonb;
  v_item record;
begin
  if auth.uid() is null or not private.spike_is_owner() then
    raise exception 'SPIKE owner access required' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users u where u.id=p_user_id and u.deleted_at is null) then
    raise exception 'User not found';
  end if;

  for v_fk in
    select c.conrelid::regclass::text as table_name,
           string_agg(format('%I = $1', a.attname), ' and ') as predicate
    from pg_constraint c
    join pg_attribute ta on ta.attrelid=c.confrelid and ta.attnum=any(c.confkey)
    join lateral unnest(c.conkey,c.confkey) as k(attnum,confattnum) on true
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
    where c.contype='f'
      and c.confdeltype in ('a','r')
      and c.confrelid in ('auth.users'::regclass,'public.profiles'::regclass)
      and ta.attnum=k.confattnum and ta.attname='id'
    group by c.oid,c.conrelid
  loop
    execute format('select count(*) from %s where %s', v_fk.table_name, v_fk.predicate) into v_count using p_user_id;
    if v_count > 0 then
      v_fk_blockers := v_fk_blockers || jsonb_build_array(jsonb_build_object('table',v_fk.table_name,'rows',v_count));
    end if;
  end loop;

  for v_item in
    select * from (values
      ('public.wallets','user_id','balance > 0'),
      ('public.coin_ledger','user_id','true'),
      ('public.coin_orders','user_id','true'),
      ('public.coin_transactions','user_id','true'),
      ('public.gem_transactions','user_id','true'),
      ('public.gift_history','sender_id','true'),
      ('public.gift_history','receiver_id','true'),
      ('public.spike_room_gift_transactions','sender_id','true'),
      ('public.spike_room_gift_transactions','receiver_id','true'),
      ('public.spike_live_audio_gift_transactions','sender_id','true'),
      ('public.spike_live_audio_gift_transactions','room_owner_id','true'),
      ('public.spike_live_audio_gift_transactions','broadcaster_id','true'),
      ('public.spike_creator_earnings_ledger','user_id','true'),
      ('public.spike_creator_wallets','user_id','true'),
      ('public.spike_creator_withdrawals','user_id','true'),
      ('public.spike_creator_payout_accounts','user_id','true'),
      ('public.spike_payout_accounts','user_id','true'),
      ('public.monthly_payouts','user_id','true'),
      ('public.spike_revenue','user_id','true'),
      ('public.spike_room_message_rewards','sender_id','true'),
      ('public.spike_room_message_rewards','receiver_id','true'),
      ('public.spike_coin_source_balances','user_id','paid_balance > 0 or bonus_balance > 0'),
      ('private.spike_verified_subscriptions','user_id','true')
    ) as x(table_name,column_name,condition)
  loop
    if to_regclass(v_item.table_name) is not null then
      execute format('select count(*) from %s where %I = $1 and (%s)',v_item.table_name,v_item.column_name,v_item.condition) into v_count using p_user_id;
      if v_count > 0 then
        v_financial := v_financial || jsonb_build_array(jsonb_build_object('table',v_item.table_name,'rows',v_count));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'user_id',p_user_id,
    'allowed',jsonb_array_length(v_fk_blockers)=0 and jsonb_array_length(v_financial)=0,
    'foreign_key_blockers',v_fk_blockers,
    'financial_history',v_financial,
    'message',case when jsonb_array_length(v_financial)>0 then 'Deletion is blocked because this account has financial or gift history that must be retained.' when jsonb_array_length(v_fk_blockers)>0 then 'Deletion is blocked by linked records that must be resolved or retained.' else 'Preflight passed. Permanent deletion will remove the account and remaining cascading personal records.' end
  );
end;
$function$;

create or replace function public.admin_user_delete_preflight(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.admin_user_delete_preflight(p_user_id);
$function$;

grant execute on function private.admin_user_delete_preflight(uuid) to authenticated;
grant execute on function public.admin_user_delete_preflight(uuid) to authenticated;
revoke execute on function public.admin_user_delete_preflight(uuid) from anon, public;
