CREATE OR REPLACE FUNCTION public.admin_creator_revenue_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private'
AS $function$
DECLARE v_entries bigint; v_revenue_minor bigint; v_gross_units numeric; v_share_units numeric; v_creator_net_units numeric;
BEGIN
  IF NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  SELECT count(*),coalesce(sum(amount_minor),0)::bigint,
    coalesce(sum((metadata->>'gross_earning_units')::numeric),0),
    coalesce(sum((metadata->>'platform_share_units')::numeric),0),
    coalesce(sum((metadata->>'creator_net_units')::numeric),0)
  INTO v_entries,v_revenue_minor,v_gross_units,v_share_units,v_creator_net_units
  FROM public.spike_revenue WHERE source='creator_earning_share';
  RETURN jsonb_build_object('entries',v_entries,'platform_share_revenue_minor',v_revenue_minor,
    'platform_share_revenue_naira',round(v_revenue_minor/100.0,2),'gross_earning_units',v_gross_units,
    'platform_share_units',v_share_units,'creator_net_units',v_creator_net_units,'earning_units_per_coin',1000);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_creator_revenue_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_creator_revenue_summary() TO authenticated;
