create policy spike_admin_user_notes_deny_browser_access
on public.spike_admin_user_notes
for all to anon, authenticated
using (false) with check (false);
