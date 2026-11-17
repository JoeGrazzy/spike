BEGIN;
DROP POLICY IF EXISTS spike_live_audio_gift_transactions_explicit_deny
  ON public.spike_live_audio_gift_transactions;
CREATE POLICY spike_live_audio_gift_transactions_explicit_deny
  ON public.spike_live_audio_gift_transactions
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
COMMIT;
