CREATE OR REPLACE FUNCTION public.admin_creator_post_earning(
  p_user_id uuid,p_amount_units bigint,p_source_type text,p_source_reference text,p_description text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','private'
AS $function$
BEGIN
  IF NOT private.spike_is_owner() THEN RAISE EXCEPTION 'Dedicated Owner access required' USING errcode='42501'; END IF;
  IF p_amount_units IS NULL OR p_amount_units=0 THEN RAISE EXCEPTION 'A non-zero whole Earning Coin amount is required'; END IF;
  RETURN public.admin_creator_post_earning_v2(p_user_id,p_amount_units::numeric,p_source_type,p_source_reference,p_description);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_creator_post_earning(uuid,bigint,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_creator_post_earning(uuid,bigint,text,text,text) TO authenticated;
