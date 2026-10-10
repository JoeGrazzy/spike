-- Repair admin RPC wrappers whose private helper EXECUTE privileges are intentionally restricted.
-- SECURITY DEFINER lets the wrapper call the private helper as its owner; the helper still checks auth.uid()/admin_guard().
ALTER FUNCTION public.admin_set_user_verified(uuid, boolean) SECURITY DEFINER;
ALTER FUNCTION public.admin_set_user_verified(uuid, boolean) SET search_path = pg_catalog, public, private, auth;
REVOKE ALL ON FUNCTION public.admin_set_user_verified(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_verified(uuid, boolean) TO authenticated;

ALTER FUNCTION public.admin_list_user_verification(uuid[]) SECURITY DEFINER;
ALTER FUNCTION public.admin_list_user_verification(uuid[]) SET search_path = pg_catalog, public, private, auth;
REVOKE ALL ON FUNCTION public.admin_list_user_verification(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_verification(uuid[]) TO authenticated;

-- The prior bulk post handler called admin_guard() but ignored its false return.
-- Enforce authorization, validate actions, and report the number of rows actually changed.
CREATE OR REPLACE FUNCTION public.admin_post_bulk_action(
  p_post_ids text[],
  p_action text,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_count integer := 0;
  v_id text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.admin_guard() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_post_ids IS NULL OR coalesce(array_length(p_post_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'No posts selected';
  END IF;
  IF array_length(p_post_ids, 1) > 100 THEN
    RAISE EXCEPTION 'Maximum 100 posts per bulk action';
  END IF;
  IF p_action NOT IN (
    'delete', 'restore', 'hide', 'mark_reviewed', 'restrict_distribution',
    'unrestrict_distribution', 'lock_comments', 'unlock_comments',
    'lock_reactions', 'unlock_reactions', 'disable_sharing', 'enable_sharing'
  ) THEN
    RAISE EXCEPTION 'Unsupported post action';
  END IF;

  IF p_action = 'delete' THEN
    FOREACH v_id IN ARRAY p_post_ids LOOP
      UPDATE public.app_documents d
         SET updated_at = now(),
             data = coalesce(d.data, '{}'::jsonb)
                    || jsonb_build_object(
                         'deleted', true,
                         'moderation', coalesce(d.data->'moderation', '{}'::jsonb)
                           || jsonb_build_object(
                                'action', 'delete',
                                'reason', left(coalesce(p_reason, ''), 1000),
                                'at', now(),
                                'by', auth.uid()
                              )
                       )
       WHERE d.collection_name = 'posts'
         AND d.document_id = v_id
         AND NOT coalesce((d.data->>'deleted')::boolean, false);
      IF FOUND THEN
        v_count := v_count + 1;
      END IF;
    END LOOP;
  ELSIF p_action = 'restore' THEN
    FOREACH v_id IN ARRAY p_post_ids LOOP
      UPDATE public.app_documents d
         SET updated_at = now(),
             data = coalesce(d.data, '{}'::jsonb)
                    || jsonb_build_object(
                         'deleted', false,
                         'moderation', coalesce(d.data->'moderation', '{}'::jsonb)
                           || jsonb_build_object(
                                'action', 'restore',
                                'reason', left(coalesce(p_reason, ''), 1000),
                                'at', now(),
                                'by', auth.uid()
                              )
                       )
       WHERE d.collection_name = 'posts'
         AND d.document_id = v_id
         AND coalesce((d.data->>'deleted')::boolean, false);
      IF FOUND THEN
        v_count := v_count + 1;
      END IF;
    END LOOP;
  ELSE
    FOREACH v_id IN ARRAY p_post_ids LOOP
      PERFORM public.admin_post_action(v_id, p_action, coalesce(p_reason, ''));
      v_count := v_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'action', p_action,
    'requested', array_length(p_post_ids, 1),
    'affected', v_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_post_bulk_action(text[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_post_bulk_action(text[], text, text) TO authenticated;
