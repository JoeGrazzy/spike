CREATE OR REPLACE FUNCTION public.admin_creator_post_earning_v2(
  p_user_id uuid,p_gross_earning_coins numeric,p_source_type text,p_source_reference text,p_description text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private'
AS $function$
DECLARE v_units bigint;
BEGIN
  IF NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_gross_earning_coins IS NULL OR p_gross_earning_coins=0 OR abs(p_gross_earning_coins)>1000000
     OR round(p_gross_earning_coins*1000,0)<>p_gross_earning_coins*1000
     OR p_source_type NOT IN ('creator_reward','gift_share','room_share','campaign','adjustment')
     OR (p_gross_earning_coins<0 AND p_source_type<>'adjustment')
     OR (p_gross_earning_coins>0 AND p_source_type='adjustment') THEN
    RAISE EXCEPTION 'Positive credits must use an eligible earning source; adjustments are for negative corrections only';
  END IF;
  v_units:=round(p_gross_earning_coins*1000)::bigint;
  RETURN private.spike_credit_creator_earning(p_user_id,v_units,p_source_type,p_source_reference,p_description,auth.uid());
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_creator_post_earning_v2(uuid,numeric,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_creator_post_earning_v2(uuid,numeric,text,text,text) TO authenticated;
