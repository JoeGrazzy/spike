drop policy if exists spike_room_live_audio_requests_deny_direct on private.spike_room_live_audio_requests;
create policy spike_room_live_audio_requests_deny_direct
on private.spike_room_live_audio_requests
for all to anon, authenticated
using (false)
with check (false);
