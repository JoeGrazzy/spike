-- admin_announcement_list performs expiry reconciliation while listing rows.
-- PostgreSQL forbids UPDATE statements inside STABLE functions; VOLATILE is required.
ALTER FUNCTION public.admin_announcement_list(text, integer) VOLATILE;
