-- SPIKE Notification preference enforcement v1
-- Makes the Settings notification-type controls authoritative for all notification inserts.

create or replace function private.notification_preference_enabled(
  p_user_id uuid,
  p_type text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prefs jsonb;
  category text;
begin
  if p_user_id is null or p_type is null or btrim(p_type) = '' then
    return true;
  end if;

  category := case
    when lower(p_type) in ('like','reaction') then 'likes'
    when lower(p_type) = 'comment' then 'comments'
    when lower(p_type) = 'mention' then 'mentions'
    when lower(p_type) in ('follow','unfollow') then 'follows'
    when lower(p_type) like 'friend_%' then 'friend_requests'
    when lower(p_type) = 'message' then 'messages'
    when lower(p_type) like 'call_%' then 'calls'
    when lower(p_type) like 'room_%' or lower(p_type) like 'spike_circle_%' or lower(p_type) like 'spike_battle_%' then 'rooms'
    when lower(p_type) like 'coin_%' or lower(p_type) like 'gem_%' then 'coins'
    when lower(p_type) like '%purchase%' then 'purchases'
    when lower(p_type) = 'announcement' or lower(p_type) like 'announcement_%' then 'announcements'
    when lower(p_type) = 'system' or lower(p_type) like 'spike_policy_%' then 'system'
    else null
  end;

  if category is null then
    return true;
  end if;

  select coalesce(notification_preferences, '{}'::jsonb)
    into prefs
  from public.user_app_settings
  where user_id = p_user_id;

  return coalesce((prefs ->> category)::boolean, true);
exception when others then
  -- Preference failures must never break the business transaction that caused a notification.
  return true;
end;
$$;

revoke all on function private.notification_preference_enabled(uuid,text) from public, anon, authenticated;
grant execute on function private.notification_preference_enabled(uuid,text) to postgres, service_role;

create or replace function private.enforce_notification_preference()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.notification_preference_enabled(new.user_id, new.type) then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_notification_preference() from public, anon, authenticated;
grant execute on function private.enforce_notification_preference() to postgres, service_role;

drop trigger if exists notifications_preference_guard on public.notifications;
create trigger notifications_preference_guard
before insert on public.notifications
for each row execute function private.enforce_notification_preference();

-- Like/reaction notifications were logged for engagement analytics but were not previously
-- emitted into the notification center. Wire those events into the same preference-aware path.
create or replace function private.trg_post_engagement_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor text;
begin
  if new.owner_id is null or new.actor_id is null or new.owner_id = new.actor_id then
    return new;
  end if;
  if new.action_type not in ('like','reaction') then
    return new;
  end if;

  select coalesce(display_name, username, 'Someone')
    into actor
  from public.profiles
  where id = new.actor_id;

  perform private.emit_notification(
    new.owner_id,
    'like',
    jsonb_build_object(
      'actor_id', new.actor_id,
      'actor_name', coalesce(actor,'Someone'),
      'post_id', new.post_id,
      'action_type', new.action_type,
      'title', case when new.action_type='reaction' then 'New reaction' else 'New like' end,
      'body', coalesce(actor,'Someone') || case when new.action_type='reaction' then ' reacted to your post' else ' liked your post' end
    ),
    'normal',
    'post-engagement:' || new.id::text,
    'post:' || new.post_id || ':likes',
    null
  );
  return new;
end;
$$;

revoke all on function private.trg_post_engagement_notification() from public, anon, authenticated;
grant execute on function private.trg_post_engagement_notification() to postgres, service_role;

drop trigger if exists trg_spike_post_engagement_notifications on public.post_engagement_events;
create trigger trg_spike_post_engagement_notifications
after insert on public.post_engagement_events
for each row execute function private.trg_post_engagement_notification();
