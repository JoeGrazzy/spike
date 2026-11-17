ALTER FUNCTION public.spike_creator_wallet_summary() RENAME TO spike_creator_wallet_summary_internal;
REVOKE ALL ON FUNCTION public.spike_creator_wallet_summary_internal() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.spike_creator_wallet_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','private'
AS $function$
DECLARE v_summary jsonb;
BEGIN
  v_summary:=public.spike_creator_wallet_summary_internal();
  RETURN coalesce(v_summary,'{}'::jsonb)-'creator_earning_share_bps';
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_creator_wallet_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_creator_wallet_summary() TO authenticated;
CREATE OR REPLACE FUNCTION public.spike_creator_wallet_summary_v2()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$ SELECT public.spike_creator_wallet_summary(); $function$;
REVOKE ALL ON FUNCTION public.spike_creator_wallet_summary_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_creator_wallet_summary_v2() TO authenticated;

ALTER FUNCTION public.spike_my_creator_earnings() RENAME TO spike_my_creator_earnings_internal;
REVOKE ALL ON FUNCTION public.spike_my_creator_earnings_internal() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.spike_my_creator_earnings()
RETURNS TABLE(id uuid,amount_units bigint,source_type text,source_reference text,description text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
  SELECT l.id,l.amount_units,l.source_type,l.source_reference,l.description,l.created_at
  FROM public.spike_creator_earnings_ledger l WHERE l.user_id=auth.uid()
  ORDER BY l.created_at DESC LIMIT 100;
$function$;
REVOKE ALL ON FUNCTION public.spike_my_creator_earnings() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_my_creator_earnings() TO authenticated;
