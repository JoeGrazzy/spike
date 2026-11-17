BEGIN;
REVOKE ALL ON TABLE public.spike_room_audio_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.spike_room_audio_invites TO authenticated;
COMMIT;
