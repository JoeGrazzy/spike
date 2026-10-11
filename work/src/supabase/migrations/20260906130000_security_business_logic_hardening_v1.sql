-- SPIKE security/business-logic hardening
-- Live-applied during the 2026-09-06 hardening pass.

-- Remove the legacy client-priced event purchase endpoint. The replacement
-- derives the coin price from the server-side event record.
create or replace function public.room_buy_event_with_coins(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_event public.room_events;
  v_wallet public.wallets;
  v_after bigint;
  v_ticket public.room_event_tickets;
  v_count integer;
  v_coin_amount bigint;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_event
  from public.room_events
  where id = p_event_id and starts_at > now();
  if not found then raise exception 'Event not found or already started'; end if;

  if v_event.ticket_price_minor is null or v_event.ticket_price_minor <= 0 then
    raise exception 'Event ticket price is not configured';
  end if;
  if v_event.ticket_currency is distinct from 'NGN' then
    raise exception 'Coin purchase is only configured for NGN events';
  end if;

  -- NGN minor units are kobo; coin price is derived server-side.
  v_coin_amount := ceil(v_event.ticket_price_minor::numeric / 100)::bigint;
  if v_coin_amount < 100 or v_coin_amount > 500 then
    raise exception 'Event ticket price must be 100–500 coins';
  end if;

  if v_event.capacity is not null then
    select count(*) into v_count
    from public.room_event_tickets
    where event_id = p_event_id;
    if v_count >= v_event.capacity then raise exception 'Event is full'; end if;
  end if;

  if exists (
    select 1 from public.room_event_tickets
    where event_id = p_event_id and user_id = v_user
  ) then
    raise exception 'You already have a ticket';
  end if;

  select * into v_wallet
  from public.wallets
  where user_id = v_user
  for update;

  if not found then
    insert into public.wallets(user_id, balance)
    values(v_user, 0)
    returning * into v_wallet;
  end if;

  if v_wallet.balance < v_coin_amount then
    raise exception 'Insufficient coins';
  end if;

  v_after := v_wallet.balance - v_coin_amount;
  update public.wallets
  set balance = v_after, updated_at = now()
  where user_id = v_user;

  insert into public.coin_ledger(
    user_id, amount, balance_before, balance_after,
    transaction_type, reference_id, reason
  ) values (
    v_user, -v_coin_amount, v_wallet.balance, v_after,
    'event_ticket', p_event_id::text,
    'Purchased event ticket: ' || v_event.title
  );

  insert into public.room_event_tickets(event_id, user_id)
  values(p_event_id, v_user)
  returning * into v_ticket;

  return jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'ticket_id', v_ticket.id,
    'balance', v_after,
    'coin_amount', v_coin_amount
  );
end;
$$;

revoke execute on function public.room_buy_event_with_coins(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.room_buy_event_with_coins(uuid) from public, anon;
grant execute on function public.room_buy_event_with_coins(uuid) to authenticated;

-- Purchase requests must be tied to a real active room and, for events,
-- the exact event in that room. Price data is always derived server-side.
create or replace function public.room_create_purchase_request(
  p_room_id uuid,
  p_item_id uuid,
  p_payment_method text,
  p_purchase_option text default null,
  p_event_id uuid default null,
  p_whatsapp_handle text default null
)
returns public.room_purchase_requests
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_item public.room_store_items;
  v_room public.rooms;
  v_event public.room_events;
  v_out public.room_purchase_requests;
  v_coin bigint := 0;
  v_fiat bigint := 0;
  v_wa text := nullif(trim(coalesce(p_whatsapp_handle,'')), '');
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_payment_method <> 'whatsapp' then
    raise exception 'All purchases must be submitted for WhatsApp/admin payment verification';
  end if;
  if v_wa is null or length(v_wa) < 3 or length(v_wa) > 120 then
    raise exception 'WhatsApp handle or number is required';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id and active = true;
  if not found then raise exception 'Room unavailable'; end if;

  if not public.is_room_member(p_room_id) then
    raise exception 'Room membership required';
  end if;

  select * into v_item
  from public.room_store_items
  where id = p_item_id and active = true;
  if not found then raise exception 'Item unavailable'; end if;

  v_fiat := coalesce(v_item.fiat_price_minor, 0);

  if v_item.item_type = 'coin_pack' then
    if v_fiat <= 0 then raise exception 'Coin package cash price is not configured'; end if;
    v_coin := coalesce((v_item.metadata->>'coins')::bigint, 0)
            + coalesce((v_item.metadata->>'bonus_coins')::bigint, 0);
    if v_coin <= 0 then raise exception 'Coin package amount is not configured'; end if;

  elsif v_item.item_type = 'event_ticket' then
    if p_event_id is null then raise exception 'Event is required'; end if;

    select * into v_event
    from public.room_events
    where id = p_event_id
      and room_id = p_room_id
      and starts_at > now();
    if not found then raise exception 'Event is unavailable'; end if;

    if v_event.ticket_price_minor is null or v_event.ticket_price_minor <= 0 then
      raise exception 'Event ticket price is not configured';
    end if;
    if v_event.ticket_currency is distinct from v_item.currency then
      raise exception 'Event currency does not match item currency';
    end if;

    v_coin := ceil(v_event.ticket_price_minor::numeric / 100)::bigint;
    if v_coin < 100 or v_coin > 500 then
      raise exception 'Event ticket price must be 100–500 coins';
    end if;
    v_fiat := v_event.ticket_price_minor;

  else
    if v_fiat <= 0 then raise exception 'Cash price is not configured'; end if;
    if p_event_id is not null then
      raise exception 'Event is only valid for event tickets';
    end if;
  end if;

  insert into public.room_purchase_requests(
    user_id, room_id, item_id, item_type, item_name,
    coin_amount, fiat_amount_minor, currency, payment_method,
    purchase_option, event_id, status, whatsapp_handle
  ) values (
    v_user, p_room_id, v_item.id, v_item.item_type, v_item.name,
    v_coin, v_fiat, v_item.currency, 'whatsapp',
    p_purchase_option, p_event_id, 'pending', v_wa
  ) returning * into v_out;

  return v_out;
end;
$$;

-- Legacy/dead overloads only raise an error and are no longer part of the API.
revoke execute on function public.room_create_purchase_request(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.room_create_purchase_request(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.room_create_purchase_request(uuid, uuid, text, text, uuid, text) from public, anon;
grant execute on function public.room_create_purchase_request(uuid, uuid, text, text, uuid, text) to authenticated;

-- Bound telemetry payloads: authenticated users can write events, but cannot
-- submit arbitrarily large/non-object JSON payloads.
create or replace function public.spike_record_event(
  p_event_name text,
  p_session_id uuid default null,
  p_client_event_id uuid default null,
  p_page text default null,
  p_properties jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if char_length(btrim(coalesce(p_event_name,''))) < 1
     or char_length(btrim(p_event_name)) > 120 then
    raise exception 'invalid event name';
  end if;
  if jsonb_typeof(coalesce(p_properties,'{}'::jsonb)) <> 'object' then
    raise exception 'event properties must be a JSON object';
  end if;
  if pg_column_size(coalesce(p_properties,'{}'::jsonb)) > 8192 then
    raise exception 'event properties too large';
  end if;

  insert into public.spike_event_log(
    user_id,event_name,session_id,client_event_id,page,properties
  ) values (
    auth.uid(),btrim(p_event_name),p_session_id,p_client_event_id,
    nullif(left(coalesce(p_page,''),200),''),coalesce(p_properties,'{}'::jsonb)
  )
  on conflict (user_id,client_event_id)
  do update set event_name=excluded.event_name
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.spike_record_event(text, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.spike_record_event(text, uuid, uuid, text, jsonb) to authenticated;

-- Performance: supports weekly completion lookups/RLS predicates.
create index if not exists idx_gamification_weekly_completions_challenge_id
on public.gamification_weekly_completions(challenge_id);

-- QR profile lookup now respects the same discovery/privacy rule as the rest
-- of the public profile APIs.
create or replace function public.get_qr_connect_profile(p_user_id uuid)
returns table(
  id uuid, username text, display_name text, avatar_url text,
  bio text, website text, sp_id text, created_at timestamptz, verified boolean
)
language sql
stable security definer
set search_path = public
as $$
  select p.id,p.username,p.display_name,p.avatar_url,p.bio,p.website,
         p.sp_id,p.created_at,p.verified
  from public.profiles p
  where auth.uid() is not null
    and p_user_id is not null
    and p.id = p_user_id
    and p.id <> auth.uid()
    and public.can_discover_spike_profile(auth.uid(), p.id);
$$;

revoke execute on function public.get_qr_connect_profile(uuid) from public, anon;
grant execute on function public.get_qr_connect_profile(uuid) to authenticated;
