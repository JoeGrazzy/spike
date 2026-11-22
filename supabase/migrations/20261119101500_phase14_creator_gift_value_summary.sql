-- Expose a creator-scoped gift value summary without exposing private commission settings.
-- The RPC returns only the signed-in creator's own gift totals and net earnings.
create or replace function public.spike_my_creator_earnings()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to view creator earnings.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total_earned_ngn', coalesce((select sum(creator_amount_ngn) from private.spike_creator_earnings where creator_id = v_uid and status <> 'reversed'), 0),
    'available_ngn', coalesce((select sum(creator_amount_ngn) from private.spike_creator_earnings where creator_id = v_uid and status = 'available'), 0),
    'reserved_ngn', coalesce((select sum(creator_amount_ngn) from private.spike_creator_earnings where creator_id = v_uid and status = 'reserved'), 0),
    'paid_ngn', coalesce((select sum(creator_amount_ngn) from private.spike_creator_earnings where creator_id = v_uid and status = 'paid'), 0),
    'gift_value_ngn', coalesce((select sum(e.gross_backed_value_ngn) from private.spike_creator_earnings e join private.spike_gift_events g on g.id = e.gift_event_id where e.creator_id = v_uid and e.status <> 'reversed' and g.status <> 'reversed'), 0),
    'gift_count', coalesce((select count(*) from private.spike_creator_earnings e join private.spike_gift_events g on g.id = e.gift_event_id where e.creator_id = v_uid and e.status <> 'reversed' and g.status <> 'reversed'), 0),
    'coins_received', coalesce((select sum(g.coin_quantity)
      from private.spike_creator_earnings e
      join private.spike_gift_events g on g.id = e.gift_event_id
      where e.creator_id = v_uid and e.status <> 'reversed' and g.status <> 'reversed'), 0),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'amount_ngn', e.creator_amount_ngn, 'status', e.status, 'created_at', e.created_at) order by e.created_at desc)
      from (select id, creator_amount_ngn, status, created_at from private.spike_creator_earnings where creator_id = v_uid order by created_at desc limit 100) e), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.spike_my_creator_earnings() from public, anon, authenticated;
grant execute on function public.spike_my_creator_earnings() to authenticated;
