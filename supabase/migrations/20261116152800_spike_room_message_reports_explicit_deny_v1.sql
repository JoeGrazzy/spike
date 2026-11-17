-- Keep room-message reports inaccessible through direct browser table access.
-- The authenticated RPC validates room membership and writes the report.
drop policy if exists spike_room_message_reports_deny_all on public.spike_room_message_reports;
create policy spike_room_message_reports_deny_all
on public.spike_room_message_reports
for all to authenticated
using (false)
with check (false);
