DO $patch$
DECLARE
  v_definition text;
  v_anchor text := $anchor$  if p_action not in ('like','reaction','comment','save','unsave','view','share') then
    raise exception 'Unsupported interaction: %', p_action;
  end if;$anchor$;
  v_replacement text := $replacement$  if p_action not in ('like','reaction','comment','save','unsave','view','share') then
    raise exception 'Unsupported interaction: %', p_action;
  end if;

  -- Legacy clients are routed through the canonical transactional comment path.
  if p_action = 'comment' then
    if p_comment is null or jsonb_typeof(p_comment) <> 'object' then
      raise exception 'Comment is required';
    end if;
    return public.add_post_comment(
      p_post_id,
      coalesce(p_comment->>'text', p_comment->>'content', ''),
      nullif(btrim(p_comment->>'parentCommentId'), '')
    );
  end if;$replacement$;
BEGIN
  SELECT pg_get_functiondef('public.mutate_post_interaction(text,text,text,jsonb)'::regprocedure)
    INTO v_definition;
  IF position(v_anchor in v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not safely patch mutate_post_interaction: expected validation block not found';
  END IF;
  v_definition := replace(v_definition, v_anchor, v_replacement);
  EXECUTE v_definition;
END
$patch$;
