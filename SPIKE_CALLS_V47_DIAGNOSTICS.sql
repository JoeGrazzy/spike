-- Run in the SQL editor of the Supabase project used by SPIKE.
-- This is read-only and shows the active Realtime authorization policies.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'realtime' and tablename = 'messages'
order by cmd, policyname;

-- Confirm the authenticated user id and token are valid from the client too:
-- browser console: await window.__SPIKE_SUPABASE__.auth.getSession()
-- A non-null session.user.id should match the UUID at the end of spike:call:<UUID>.
