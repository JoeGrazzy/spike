-- Allow authenticated members to update only user-editable profile fields.
-- The existing profiles_update_self RLS policy continues to restrict row ownership
-- and requires account_status = 'active'. Do not grant table-wide UPDATE: role,
-- account_status, spike_id, and other protected columns must remain server-managed.
GRANT UPDATE (
  display_name,
  username,
  bio,
  website,
  location,
  avatar_path,
  cover_path,
  is_private,
  presence_visible,
  message_privacy,
  updated_at
) ON TABLE public.profiles TO authenticated;
