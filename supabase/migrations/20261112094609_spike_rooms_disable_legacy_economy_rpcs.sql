-- SPIKE Rooms: disable legacy user-facing economy endpoints.
-- Preserve historical records and admin review tools; no wallet or purchase workflow is exposed by Rooms.
revoke all on function public.room_coin_wallet() from public, anon, authenticated;
revoke all on function public.room_coin_ledger(integer) from public, anon, authenticated;
revoke all on function public.room_create_coin_order(uuid) from public, anon, authenticated;
revoke all on function public.room_submit_coin_order_transaction(uuid,text) from public, anon, authenticated;
revoke all on function public.room_buy_event_with_coins(uuid) from public, anon, authenticated;
revoke all on function public.room_buy_event_with_coins(uuid,bigint) from public, anon, authenticated;
revoke all on function public.room_claim_event_ticket(uuid) from public, anon, authenticated;
revoke all on function public.room_create_event_purchase_request(uuid,text) from public, anon, authenticated;
revoke all on function public.room_submit_payment_transaction(uuid,text) from public, anon, authenticated;
revoke all on function public.room_event_create(uuid,text,text,timestamptz,timestamptz,bigint,text,integer) from public, anon, authenticated;
revoke all on function public.room_my_purchases(integer) from public, anon, authenticated;
