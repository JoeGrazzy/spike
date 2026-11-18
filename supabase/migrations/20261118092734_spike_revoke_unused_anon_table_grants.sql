-- These tables have authenticated-only RLS policies and no anon policies.
-- Remove unnecessary anon ACLs without changing authenticated access or RLS.
REVOKE ALL PRIVILEGES ON TABLE public.app_documents FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.feed_blocks FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.spike_inbox_preferences FROM anon;
