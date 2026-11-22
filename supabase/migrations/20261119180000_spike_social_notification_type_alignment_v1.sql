-- Align social notification trigger values with notifications_type_check.
-- Keep the existing constraint: use its canonical type values instead of broadening it.
create or replace function private.emit_social_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_actor uuid;
  v_recipient uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_type text;
  v_title text;
  v_body text;
  v_actor_label text;
begin
  if tg_table_name = 'post_likes' then
    v_actor := new.user_id;
    select p.author_id into v_recipient from public.posts p where p.id = new.post_id;
    v_entity_type := 'post'; v_entity_id := new.post_id;
    v_type := 'like'; v_title := 'New like'; v_body := 'liked your post.';
  elsif tg_table_name = 'comments' then
    if new.status <> 'published' then return new; end if;
    v_actor := new.author_id;
    select p.author_id into v_recipient from public.posts p where p.id = new.post_id;
    v_entity_type := 'post'; v_entity_id := new.post_id;
    v_type := 'comment'; v_title := 'New comment'; v_body := 'commented on your post.';
  elsif tg_table_name = 'follows' then
    if tg_op = 'UPDATE' and (old.status = new.status or new.status <> 'accepted') then
      return new;
    end if;
    v_actor := new.follower_id;
    v_recipient := new.following_id;
    v_entity_type := 'profile'; v_entity_id := new.follower_id;
    if new.status = 'accepted' then
      v_type := 'follow_accepted'; v_title := 'New follower'; v_body := 'started following you.';
    else
      v_type := 'follow_request'; v_title := 'Follow request'; v_body := 'requested to follow you.';
    end if;
  elsif tg_table_name = 'messages' then
    if new.deleted_at is not null then return new; end if;
    v_actor := new.sender_id;
    v_entity_type := 'conversation'; v_entity_id := new.conversation_id;
    v_type := 'message'; v_title := 'New message'; v_body := 'sent you a message.';
    select coalesce(nullif(btrim(p.display_name),''), nullif(p.username,''), 'Someone')
      into v_actor_label from public.profiles p where p.id = v_actor;
    insert into public.notifications(user_id, actor_id, type, entity_type, entity_id, title, body)
    select cm.user_id, v_actor, v_type, v_entity_type, v_entity_id, v_title, coalesce(v_actor_label,'Someone') || ' ' || v_body
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id <> v_actor
      and (cm.muted_until is null or cm.muted_until <= now());
    return new;
  else
    return new;
  end if;

  if v_recipient is null or v_actor is null or v_recipient = v_actor then
    return new;
  end if;

  select coalesce(nullif(btrim(p.display_name),''), nullif(p.username,''), 'Someone')
    into v_actor_label from public.profiles p where p.id = v_actor;

  insert into public.notifications(user_id, actor_id, type, entity_type, entity_id, title, body)
  values (v_recipient, v_actor, v_type, v_entity_type, v_entity_id, v_title, coalesce(v_actor_label,'Someone') || ' ' || v_body);

  return new;
end;
$function$;

revoke all on function private.emit_social_notification() from public, anon, authenticated, service_role;
