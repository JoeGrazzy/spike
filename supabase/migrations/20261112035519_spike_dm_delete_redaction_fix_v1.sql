-- Ensure SECURITY DEFINER deletion redacts all content explicitly. The guard trigger
-- intentionally bypasses privileged callers, so this RPC must do the redaction.
CREATE OR REPLACE FUNCTION public.dm_delete_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  UPDATE public.private_messages
  SET deleted_at = now(),
      body = '',
      attachment = NULL,
      media_path = NULL,
      media_mime_type = NULL,
      voice_duration_seconds = NULL,
      updated_at = now()
  WHERE id = p_message_id
    AND sender_id = auth.uid()
    AND deleted_at IS NULL;
  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION public.dm_delete_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_delete_message(uuid) TO authenticated;
