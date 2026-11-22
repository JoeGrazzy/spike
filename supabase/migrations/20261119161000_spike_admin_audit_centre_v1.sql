-- SPIKE Phase 4: owner-protected unified audit centre.
-- Reuses existing event ledgers; does not create a duplicate audit table.
create or replace function public.spike_admin_get_audit_centre(
  p_source text default 'all',
  p_search text default '',
  p_days integer default 90,
  p_limit integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, private
as $function$
declare
  v_source text := lower(coalesce(p_source, 'all'));
  v_search text := lower(trim(coalesce(p_search, '')));
  v_days integer := coalesce(p_days, 90);
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 250);
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'Owner administrator access required' using errcode = '42501';
  end if;

  if v_source not in ('all','account','suspension','verification','moderation','purchase') then
    raise exception 'Invalid audit source filter' using errcode = '22023';
  end if;
  if v_days not in (0,7,30,90,365) then
    raise exception 'Invalid audit date range' using errcode = '22023';
  end if;

  with raw_events as (
    select e.id as event_id, 'account'::text as source,
      e.action as action, e.reason as reason,
      e.previous_status as previous_state, e.new_status as new_state,
      e.actor_id, e.target_user_id, e.created_at as occurred_at
    from public.spike_admin_action_events e

    union all
    select e.id, 'suspension', e.event_type, e.reason,
      null::text, case when e.expires_at is null then 'permanent' else 'temporary' end,
      e.actor_id, e.target_user_id, e.created_at
    from public.spike_account_suspension_events e

    union all
    select e.id, 'verification', e.action, e.reason,
      null::text, e.action, e.actor_id, e.target_user_id, e.created_at
    from public.spike_admin_verification_events e

    union all
    select e.id, 'moderation', e.event_type, e.reason,
      null::text, case when e.enabled is true then 'enabled' when e.enabled is false then 'disabled' else null end,
      e.actor_id, e.target_user_id, e.created_at
    from public.spike_user_moderation_events e

    union all
    select e.id, 'purchase', 'purchase_' || e.event_type,
      coalesce(o.product_name, 'Purchase workflow event'),
      null::text, e.event_type, e.actor_id, o.user_id, e.created_at
    from public.spike_purchase_events e
    join public.spike_purchase_orders o on o.id = e.order_id
  ),
  enriched as (
    select r.*,
      coalesce(nullif(ap.display_name,''), nullif(ap.username,''), case when r.actor_id is null then 'SYSTEM' else 'Administrator' end) as actor_label,
      ap.username as actor_username,
      coalesce(nullif(tp.display_name,''), nullif(tp.username,''), 'SPIKE member') as target_label,
      tp.username as target_username,
      tp.spike_id as target_spike_id
    from raw_events r
    left join public.profiles ap on ap.id = r.actor_id
    left join public.profiles tp on tp.id = r.target_user_id
    where (v_days = 0 or r.occurred_at >= now() - make_interval(days => v_days))
      and (v_source = 'all' or r.source = v_source)
  ),
  filtered as (
    select * from enriched e
    where v_search = ''
      or e.action ilike '%' || v_search || '%'
      or coalesce(e.reason,'') ilike '%' || v_search || '%'
      or coalesce(e.actor_label,'') ilike '%' || v_search || '%'
      or coalesce(e.actor_username,'') ilike '%' || v_search || '%'
      or coalesce(e.target_label,'') ilike '%' || v_search || '%'
      or coalesce(e.target_username,'') ilike '%' || v_search || '%'
      or coalesce(e.target_spike_id,'') ilike '%' || v_search || '%'
  ),
  summary as (
    select jsonb_build_object(
      'total', count(*),
      'account', count(*) filter (where source='account'),
      'suspension', count(*) filter (where source='suspension'),
      'verification', count(*) filter (where source='verification'),
      'moderation', count(*) filter (where source='moderation'),
      'purchase', count(*) filter (where source='purchase')
    ) as value from filtered
  ),
  page as (
    select * from filtered order by occurred_at desc, event_id desc limit v_limit
  )
  select jsonb_build_object(
    'summary', (select value from summary),
    'total_count', (select count(*) from filtered),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
      'id', event_id, 'source', source, 'action', action, 'reason', reason,
      'previous_state', previous_state, 'new_state', new_state,
      'actor_id', actor_id, 'actor_label', actor_label, 'actor_username', actor_username,
      'target_user_id', target_user_id, 'target_label', target_label,
      'target_username', target_username, 'target_spike_id', target_spike_id,
      'occurred_at', occurred_at
    ) order by occurred_at desc, event_id desc) from page), '[]'::jsonb),
    'permissions', jsonb_build_object(
      'model', 'owner_only',
      'owner_guard_active', true,
      'delegated_administrators_enabled', false,
      'description', 'Only the active SPIKE owner account is authorised to use privileged administration tools.'
    )
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.spike_admin_get_audit_centre(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.spike_admin_get_audit_centre(text,text,integer,integer) to authenticated;
