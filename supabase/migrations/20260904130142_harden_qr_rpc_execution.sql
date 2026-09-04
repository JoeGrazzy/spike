-- QR/profile security hardening applied to production on 2026-09-04.
-- Keep QR relationship RPCs callable only by authenticated users.
revoke execute on function public.connect_via_spike_qr(uuid) from public;
revoke execute on function public.get_profile_relationship(uuid) from public;
revoke execute on function public.can_discover_spike_profile(uuid, uuid) from public;
revoke execute on function public.ensure_my_sp_id() from public;
grant execute on function public.connect_via_spike_qr(uuid) to authenticated;
grant execute on function public.get_profile_relationship(uuid) to authenticated;
grant execute on function public.can_discover_spike_profile(uuid, uuid) to authenticated;
grant execute on function public.ensure_my_sp_id() to authenticated;

-- SECURITY DEFINER is intentional for these helpers because they cross RLS boundaries.
-- Their bodies already schema-qualify data access and enforce auth.uid()-based rules.
