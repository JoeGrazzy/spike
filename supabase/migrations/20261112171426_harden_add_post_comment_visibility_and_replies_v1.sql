create or replace function public.add_post_comment(
  p_post_id text,
  p_text text,
  p_parent_comment_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.app_documents;
  v_data jsonb;
  v_comments jsonb;
  v_comment jsonb;
  v_name text;
  v_avatar text;
  v_id text := gen_random_uuid()::text;
  v_author uuid;
  v_parent_id text := nullif(btrim(p_parent_comment_id), '');
  v_text text := btrim(coalesce(p_text, ''));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if char_length(v_text) < 1 or char_length(v_text) > 5000 then
    raise exception 'Comment must be between 1 and 5000 characters';
  end if;

  select * into v_row
  from public.app_documents
  where path = 'posts/' || p_post_id
    and collection_name = 'posts'
  for update;

  if not found then
    raise exception 'Post not found';
  end if;

  v_data := coalesce(v_row.data, '{}'::jsonb);
  if coalesce(v_data->>'deleted', 'false') = 'true'
     or coalesce(v_data->'moderation'->>'status', '') = 'removed' then
    raise exception 'Post is not available';
  end if;

  v_author := nullif(v_data->>'authorUid', '')::uuid;
  if v_author is null or not public.can_view_feed_post(v_author, v_data) then
    raise exception 'Post is not available';
  end if;

  v_comments := case
    when jsonb_typeof(v_data->'comments') = 'array' then v_data->'comments'
    else '[]'::jsonb
  end;

  if v_parent_id is not null and not exists (
    select 1
    from jsonb_array_elements(v_comments) as existing_comment
    where existing_comment->>'id' = v_parent_id
  ) then
    raise exception 'Reply target is not part of this post';
  end if;

  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(full_name), ''), nullif(btrim(username), ''), 'User'), avatar_url
  into v_name, v_avatar
  from public.profiles
  where id = v_uid;

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

  insert into public.comments(id, post_id, user_id, parent_comment_id, content, created_at)
  values (v_id, p_post_id, v_uid, v_parent_id, v_text, now());

  v_comments := v_comments || jsonb_build_array(v_comment);
  v_data := jsonb_set(v_data, '{comments}', v_comments, true);
  update public.app_documents
  set data = v_data, updated_at = now()
  where path = v_row.path;

  perform private.log_post_engagement(
    v_author,
    v_uid,
    p_post_id,
    'comment',
    jsonb_build_object('comment_id', v_id, 'text', left(v_text, 5000))
  );

  return jsonb_build_object('comment', v_comment, 'comments', v_comments, 'data', v_data);
end;
$$;

revoke all on function public.add_post_comment(text, text, text) from public, anon;
grant execute on function public.add_post_comment(text, text, text) to authenticated;
