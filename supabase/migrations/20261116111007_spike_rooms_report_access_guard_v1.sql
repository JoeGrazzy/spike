-- Room reports are written only by the validated report RPC.
-- Only the designated SPIKE Owner may inspect report records.
drop policy if exists spike_room_reports_owner_read on public.spike_room_reports;
create policy spike_room_reports_owner_read
on public.spike_room_reports
for select to authenticated
using (private.spike_is_owner());
grant select on table public.spike_room_reports to authenticated;
