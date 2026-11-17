-- RLS policies call this safe boolean predicate directly for authenticated owners.
GRANT EXECUTE ON FUNCTION private.spike_is_owner() TO authenticated;
