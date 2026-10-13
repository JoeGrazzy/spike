-- SPIKE inbox summaries v1: return one row per conversation rather than transferring message history.
-- Safe for authenticated users only; the caller can see summaries only for their own conversations.
create index if not exists private_messages_sender_created_id_idx
  on public.private_messages (sender_id, created_at desc, id desc);
create index if not exists private_messages_recipient_created_id_idx
  on public.private_messages (recipient_id, created_at desc, id desc);
create index if not exists private_messages_recipient_unread_created_idx
  on public.private_messages (recipient_id, created_at desc)
  where read is false and deleted_at is null;

create or replace function public.spike_get_inbox_summaries()
returns table (
  other_user_id uuid,
  latest_message_id uuid,
  latest_sender_id uuid,
  latest_recipient_id uuid,
  latest_body text,
  latest_message_type text,
  latest_read boolean,
  latest_created_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with me as (select auth.uid() as user_id),
  relevant as (
    select pm.id, pm.sender_id, pm.recipient_id, pm.body, pm.message_type,
           pm.read, pm.created_at, pm.deleted_at,
           case when pm.sender_id = me.user_id then pm.recipient_id else pm.sender_id end as peer_id
    from public.private_messages pm cross join me
    where me.user_id is not null
      and (pm.sender_id = me.user_id or pm.recipient_id = me.user_id)
      and pm.deleted_at is null
  ),
  latest as (
    select distinct on (peer_id) peer_id, id, sender_id, recipient_id, body,
           message_type, read, created_at
    from relevant
    order by peer_id, created_at desc, id desc
  ),
  unread as (
    select sender_id as peer_id, count(*)::bigint as n
    from relevant cross join me
    where recipient_id = me.user_id and sender_id <> me.user_id and read is false
    group by sender_id
  )
  select l.peer_id, l.id, l.sender_id, l.recipient_id, l.body,
         l.message_type, l.read, l.created_at, coalesce(u.n, 0)::bigint
  from latest l left join unread u on u.peer_id = l.peer_id
  order by l.created_at desc, l.id desc;
$$;
revoke all on function public.spike_get_inbox_summaries() from public, anon;
grant execute on function public.spike_get_inbox_summaries() to authenticated;
