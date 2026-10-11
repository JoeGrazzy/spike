-- SPIKE profile media permission repair.
-- Keep permissions limited to user-editable identity fields; do not grant table-wide UPDATE.
GRANT UPDATE (username, display_name, bio, avatar_url, website, updated_at)
  ON TABLE public.profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.spike_update_profile_v1(jsonb, jsonb, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_spike_cover_settings(text, numeric, numeric, numeric, text)
  TO authenticated;
