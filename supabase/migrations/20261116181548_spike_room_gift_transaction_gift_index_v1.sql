-- Cover the gift catalogue foreign key for efficient transaction maintenance and joins.
CREATE INDEX IF NOT EXISTS spike_room_gift_transactions_gift_id_idx
  ON public.spike_room_gift_transactions(gift_id);
