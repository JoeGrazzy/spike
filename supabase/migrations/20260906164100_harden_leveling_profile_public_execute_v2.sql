-- PUBLIC grants are inherited by anon, so revoke both PUBLIC and anon explicitly.
REVOKE EXECUTE ON FUNCTION public.get_spike_leveling_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_spike_leveling_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_spike_leveling_profile() TO authenticated;
