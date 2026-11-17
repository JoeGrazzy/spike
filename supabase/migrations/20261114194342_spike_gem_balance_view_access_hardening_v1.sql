BEGIN;

-- The balance summary is a user-specific read model. Keep the view under
-- caller privileges and expose it only as read-only to authenticated users.
ALTER VIEW public.spike_gem_balances
  SET (security_invoker = true);

REVOKE ALL ON TABLE public.spike_gem_balances
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.spike_gem_balances
  TO authenticated;

COMMIT;
