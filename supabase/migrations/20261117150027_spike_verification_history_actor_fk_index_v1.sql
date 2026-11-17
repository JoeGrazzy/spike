CREATE INDEX IF NOT EXISTS spike_verified_identity_history_actor_idx
  ON private.spike_verified_identity_history(actor_id)
  WHERE actor_id IS NOT NULL;
