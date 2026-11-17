-- Return current gift eligibility for active room members without exposing additional profile fields.
CREATE OR REPLACE FUNCTION public.spike_room_gift_recipient_eligibility(p_room_id uuid)
RETURNS TABLE(user_id uuid,is_verified boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode='28000';
  END IF;
  IF p_room_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.spike_room_members m
    WHERE m.room_id=p_room_id AND m.user_id=auth.uid() AND m.member_state='active'
  ) THEN
    RAISE EXCEPTION 'You must be an active member of this room to view gift eligibility' USING errcode='42501';
  END IF;
  RETURN QUERY
  SELECT m.user_id,private.spike_user_has_active_verified_subscription(m.user_id)
  FROM public.spike_room_members m
  WHERE m.room_id=p_room_id AND m.member_state='active' AND m.user_id<>auth.uid()
  ORDER BY m.joined_at ASC;
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_room_gift_recipient_eligibility(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spike_room_gift_recipient_eligibility(uuid) TO authenticated;
