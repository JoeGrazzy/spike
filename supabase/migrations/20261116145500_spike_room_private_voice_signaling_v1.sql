-- Keep SDP and ICE signaling private to the two active room members
-- participating in a direct peer connection. Room presence and ordinary
-- room events continue to use the existing spike-room:<room-id> channel.

drop policy if exists spike_rooms_voice_peer_read_v1 on realtime.messages;
create policy spike_rooms_voice_peer_read_v1 on realtime.messages
for select to authenticated
using (
  extension = 'broadcast'
  and exists (
    select 1
    from public.spike_room_members a
    join public.spike_room_members b
      on b.room_id = a.room_id
     and b.user_id <> a.user_id
    where a.user_id = (select auth.uid())
      and a.member_state = 'active'
      and b.member_state = 'active'
      and (select realtime.topic()) =
        'spike-room-voice:' || a.room_id::text || ':' ||
        least(a.user_id::text, b.user_id::text) || ':' ||
        greatest(a.user_id::text, b.user_id::text)
      and exists (
        select 1 from public.spike_rooms r
        where r.id = a.room_id
          and coalesce(r.active_host_id, r.host_id) in (a.user_id, b.user_id)
      )
  )
);

drop policy if exists spike_rooms_voice_peer_write_v1 on realtime.messages;
create policy spike_rooms_voice_peer_write_v1 on realtime.messages
for insert to authenticated
with check (
  extension = 'broadcast'
  and exists (
    select 1
    from public.spike_room_members a
    join public.spike_room_members b
      on b.room_id = a.room_id
     and b.user_id <> a.user_id
    where a.user_id = (select auth.uid())
      and a.member_state = 'active'
      and b.member_state = 'active'
      and (select realtime.topic()) =
        'spike-room-voice:' || a.room_id::text || ':' ||
        least(a.user_id::text, b.user_id::text) || ':' ||
        greatest(a.user_id::text, b.user_id::text)
      and exists (
        select 1 from public.spike_rooms r
        where r.id = a.room_id
          and coalesce(r.active_host_id, r.host_id) in (a.user_id, b.user_id)
      )
  )
);
