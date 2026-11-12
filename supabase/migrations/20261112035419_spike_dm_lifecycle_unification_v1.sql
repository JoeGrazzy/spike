-- SPIKE DM lifecycle unification v1
-- Preserve existing message rows and Storage objects. Deletion queues physical
-- object removal; a service-role Edge Function performs the Storage API call.

BEGIN;

-- One canonical reaction per participant per message. The existing unique
-- (message_id,user_id) index is retained as the new primary-key invariant.
ALTER TABLE public.private_message_reactions
  DROP CONSTRAINT IF EXISTS private_message_reactions_pkey;
DROP INDEX IF EXISTS public.private_message_reactions_message_user_uidx;
ALTER TABLE public.private_message_reactions
  ADD CONSTRAINT private_message_reactions_pkey PRIMARY KEY (message_id, user_id);

ALTER TABLE public.private_message_reactions
  DROP CONSTRAINT IF EXISTS private_message_reactions_reaction_check;
ALTER TABLE public.private_message_reactions
  ADD CONSTRAINT private_message_reactions_reaction_check
  CHECK (reaction IN ('❤️'));

ALTER TABLE public.private_message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.private_message_reactions FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.private_message_reactions TO authenticated;

-- A single atomic toggle path; no read-then-write race and no direct client upsert.
CREATE OR REPLACE FUNCTION public.dm_toggle_reaction(p_message_id uuid, p_reaction text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rows integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '42501';
  END IF;
  IF p_reaction IS DISTINCT FROM '❤️' THEN
    RAISE EXCEPTION 'Unsupported direct-message reaction';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.private_messages m
    WHERE m.id = p_message_id
      AND m.deleted_at IS NULL
      AND (m.sender_id = v_uid OR m.recipient_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'Message not found or not accessible' USING errcode = '42501';
  END IF;

  DELETE FROM public.private_message_reactions
  WHERE message_id = p_message_id AND user_id = v_uid AND reaction = p_reaction;
  IF FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.private_message_reactions(message_id, user_id, reaction)
  VALUES (p_message_id, v_uid, p_reaction)
  ON CONFLICT (message_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$function$;
REVOKE ALL ON FUNCTION public.dm_toggle_reaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_toggle_reaction(uuid, text) TO authenticated;

-- Fix the RPC so it delegates content redaction to the guarded trigger and
-- does not compete with the trigger's immutable metadata rules.
CREATE OR REPLACE FUNCTION public.dm_delete_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  UPDATE public.private_messages
  SET deleted_at = now()
  WHERE id = p_message_id
    AND sender_id = auth.uid()
    AND deleted_at IS NULL;
  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION public.dm_delete_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dm_delete_message(uuid) TO authenticated;

-- Private retry queue. No client policies or grants: only the service-role
-- cleanup Edge Function can inspect or mutate this table.
CREATE TABLE IF NOT EXISTS public.spike_dm_media_cleanup_queue (
  bucket_id text NOT NULL,
  object_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  PRIMARY KEY (bucket_id, object_path)
);
ALTER TABLE public.spike_dm_media_cleanup_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.spike_dm_media_cleanup_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.spike_dm_media_cleanup_queue TO service_role;
CREATE INDEX IF NOT EXISTS spike_dm_media_cleanup_due_idx
  ON public.spike_dm_media_cleanup_queue(next_attempt_at, created_at)
  WHERE status = 'pending';

-- Enqueue both the current JSON attachment path and legacy attachment-table
-- paths before the metadata is cleared. Physical deletion happens via Storage API.
CREATE OR REPLACE FUNCTION public.spike_cleanup_deleted_private_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_attachment_path text;
  v_legacy record;
  v_should_cleanup boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_should_cleanup := true;
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_should_cleanup := true;
  END IF;

  IF NOT v_should_cleanup THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  v_attachment_path := NULLIF(OLD.attachment ->> 'path', '');
  IF v_attachment_path IS NOT NULL THEN
    INSERT INTO public.spike_dm_media_cleanup_queue(bucket_id, object_path)
    VALUES ('private-message-media', v_attachment_path)
    ON CONFLICT (bucket_id, object_path) DO UPDATE
      SET status = 'pending', next_attempt_at = now(), last_error = NULL, locked_at = NULL;
  END IF;

  IF OLD.media_path IS NOT NULL AND OLD.media_path <> v_attachment_path THEN
    INSERT INTO public.spike_dm_media_cleanup_queue(bucket_id, object_path)
    VALUES ('dm-media', OLD.media_path)
    ON CONFLICT (bucket_id, object_path) DO UPDATE
      SET status = 'pending', next_attempt_at = now(), last_error = NULL, locked_at = NULL;
  END IF;

  FOR v_legacy IN
    SELECT storage_path FROM public.private_message_attachments
    WHERE message_id = OLD.id
  LOOP
    INSERT INTO public.spike_dm_media_cleanup_queue(bucket_id, object_path)
    VALUES ('dm-media', v_legacy.storage_path)
    ON CONFLICT (bucket_id, object_path) DO UPDATE
      SET status = 'pending', next_attempt_at = now(), last_error = NULL, locked_at = NULL;
  END LOOP;

  DELETE FROM public.private_message_reactions WHERE message_id = OLD.id;
  DELETE FROM public.private_message_attachments WHERE message_id = OLD.id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.spike_cleanup_deleted_private_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_spike_cleanup_deleted_private_message ON public.private_messages;
CREATE TRIGGER trg_spike_cleanup_deleted_private_message
AFTER UPDATE OF deleted_at ON public.private_messages
FOR EACH ROW EXECUTE FUNCTION public.spike_cleanup_deleted_private_message();

DROP TRIGGER IF EXISTS trg_spike_queue_deleted_private_message ON public.private_messages;
CREATE TRIGGER trg_spike_queue_deleted_private_message
BEFORE DELETE ON public.private_messages
FOR EACH ROW EXECUTE FUNCTION public.spike_cleanup_deleted_private_message();

-- Keep the current bucket private and retain the established 50 MiB limit.
UPDATE storage.buckets
SET public = false, file_size_limit = 52428800
WHERE id = 'private-message-media';

COMMIT;
