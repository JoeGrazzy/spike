-- Extend the existing notification type allowlist for missed-call activity.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
    'follow_request'::text,
    'follow_accepted'::text,
    'like'::text,
    'comment'::text,
    'mention'::text,
    'message'::text,
    'room_invite'::text,
    'wallet'::text,
    'system'::text,
    'announcement'::text,
    'missed_call'::text
  ]));
