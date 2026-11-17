BEGIN;

CREATE OR REPLACE FUNCTION public.add_post_comment(
  p_post_id text,
  p_text text,
  p_parent_comment_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.app_documents%ROWTYPE;
  v_data jsonb;
  v_comments jsonb;
  v_comment jsonb;
  v_name text;
  v_avatar text;
  v_id text := gen_random_uuid()::text;
  v_author uuid;
  v_author_from_data uuid;
  v_parent_id text := nullif(btrim(p_parent_comment_id), '');
  v_text text := btrim(coalesce(p_text, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF private.spike_user_is_restricted(v_uid) THEN
    RAISE EXCEPTION 'Your SPIKE account is restricted from commenting';
  END IF;

  IF nullif(btrim(coalesce(p_post_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Post ID is required';
  END IF;

  IF char_length(v_text) < 1 OR char_length(v_text) > 500 THEN
    RAISE EXCEPTION 'Comment must be between 1 and 500 characters';
  END IF;

  SELECT * INTO v_row
  FROM public.app_documents
  WHERE path = 'posts/' || p_post_id
    AND collection_name = 'posts'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  v_data := coalesce(v_row.data, '{}'::jsonb);
  IF coalesce(v_data->>'deleted', 'false') = 'true'
     OR coalesce(v_data->'moderation'->>'status', '') IN ('removed', 'blocked', 'hidden') THEN
    RAISE EXCEPTION 'Post is not available';
  END IF;

  IF coalesce((v_data->'moderation'->>'comments_locked')::boolean, false) THEN
    RAISE EXCEPTION 'Comments are disabled for this post';
  END IF;

  IF coalesce(v_data->>'authorUid', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_author_from_data := (v_data->>'authorUid')::uuid;
  END IF;
  v_author := coalesce(v_row.owner_id, v_author_from_data);

  IF v_author IS NULL OR NOT public.can_view_feed_post(v_author, v_data) THEN
    RAISE EXCEPTION 'Post is not available';
  END IF;

  v_comments := CASE
    WHEN jsonb_typeof(v_data->'comments') = 'array' THEN v_data->'comments'
    ELSE '[]'::jsonb
  END;

  IF v_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_comments) AS existing_comment
    WHERE existing_comment->>'id' = v_parent_id
  ) THEN
    RAISE EXCEPTION 'Reply target is not part of this post';
  END IF;

  -- profiles intentionally has no email column; use the public display fields only.
  SELECT coalesce(
           nullif(btrim(display_name), ''),
           nullif(btrim(full_name), ''),
           nullif(btrim(username), ''),
           'User'
         ),
         coalesce(avatar_url, '')
    INTO v_name, v_avatar
  FROM public.profiles
  WHERE id = v_uid;

  v_comment := jsonb_build_object(
    'id', v_id,
    'postId', p_post_id,
    'authorUid', v_uid,
    'authorName', coalesce(v_name, 'User'),
    'authorAvatar', coalesce(v_avatar, ''),
    'text', v_text,
    'parentCommentId', v_parent_id,
    'createdAt', now()
  );

  INSERT INTO public.comments(id, post_id, user_id, parent_comment_id, content, created_at)
  VALUES (v_id, p_post_id, v_uid, v_parent_id, v_text, now());

  v_comments := v_comments || jsonb_build_array(v_comment);
  v_data := jsonb_set(v_data, '{comments}', v_comments, true);

  UPDATE public.app_documents
  SET data = v_data, updated_at = now()
  WHERE path = v_row.path;

  PERFORM private.log_post_engagement(
    v_author,
    v_uid,
    p_post_id,
    'comment',
    jsonb_build_object('comment_id', v_id, 'text', left(v_text, 500))
  );

  RETURN jsonb_build_object(
    'comment', v_comment,
    'comments', v_comments,
    'data', v_data
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.add_post_comment(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_post_comment(text, text, text) TO authenticated;

COMMIT;
