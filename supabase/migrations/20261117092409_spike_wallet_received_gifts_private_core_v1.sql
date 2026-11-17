CREATE OR REPLACE FUNCTION private.spike_my_received_gifts_internal(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '28000';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT x.id, x.reference, x.gift_name, x.gift_icon, x.gift_type,
           x.coin_cost, x.sender_id, x.sender_name, x.room_id, x.room_title,
           x.gift_context, x.created_at
    FROM (
      SELECT t.id::text AS id, t.reference, t.gift_name, t.gift_icon, t.gift_type,
             t.coin_cost, t.sender_id,
             coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), nullif(btrim(p.username), ''), 'SPIKE member') AS sender_name,
             t.room_id, coalesce(r.title, 'SPIKE room') AS room_title,
             'room'::text AS gift_context, t.created_at
      FROM public.spike_room_gift_transactions t
      LEFT JOIN public.profiles p ON p.id = t.sender_id
      LEFT JOIN public.spike_rooms r ON r.id = t.room_id
      WHERE t.receiver_id = v_uid
      UNION ALL
      SELECT t.id::text AS id, t.reference, t.gift_name, t.gift_icon, t.gift_type,
             t.coin_cost, t.sender_id,
             coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), nullif(btrim(p.username), ''), 'SPIKE member') AS sender_name,
             t.room_id, coalesce(r.title, 'SPIKE room') AS room_title,
             'live_audio'::text AS gift_context, t.created_at
      FROM public.spike_live_audio_gift_transactions t
      LEFT JOIN public.profiles p ON p.id = t.sender_id
      LEFT JOIN public.spike_rooms r ON r.id = t.room_id
      WHERE t.broadcaster_id = v_uid
    ) x
    ORDER BY x.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
  ) g;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION private.spike_my_received_gifts_internal(integer) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.spike_my_received_gifts_internal(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.spike_my_received_gifts(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.spike_my_received_gifts_internal(p_limit);
$function$;
REVOKE ALL ON FUNCTION public.spike_my_received_gifts(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spike_my_received_gifts(integer) TO authenticated;
