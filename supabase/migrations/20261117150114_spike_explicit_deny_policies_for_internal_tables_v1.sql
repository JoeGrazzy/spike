DO $$
DECLARE r record; pol text := 'spike_explicit_deny_no_direct_client_access';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('private','spike_referral_attributions'),
      ('private','spike_referral_codes'),
      ('private','spike_referral_events'),
      ('private','spike_referral_point_ledger'),
      ('private','spike_referral_settings'),
      ('private','spike_room_live_audio_sessions'),
      ('private','spike_verified_identities'),
      ('private','spike_verified_identity_history'),
      ('private','spike_verified_subscriptions'),
      ('public','gift_history'),
      ('public','spike_coin_source_balances'),
      ('public','spike_dm_media_cleanup_queue'),
      ('public','spike_gift_pool_ledger'),
      ('public','spike_room_gift_transactions'),
      ('public','user_presence')
    ) AS x(schema_name,table_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname=r.schema_name AND tablename=r.table_name AND policyname=pol
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        pol,r.schema_name,r.table_name
      );
    END IF;
  END LOOP;
END $$;
