-- Allow signed-in users to change only their own notification read state.
-- Row ownership remains enforced by notifications_update_self RLS.
GRANT UPDATE (is_read) ON TABLE public.notifications TO authenticated;
