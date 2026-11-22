-- Phase 14 / Step 1: preserve the real NGN backing value of future paid SP Coin purchases.
-- Existing aggregate balances are intentionally NOT backfilled: their source value
-- cannot be proven safely and they must not create creator cash earnings.

create table if not exists private.spike_coin_purchase_lots (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null unique
    references public.spike_purchase_orders(id) on delete restrict,
  wallet_ledger_id uuid not null unique
    references public.wallet_ledger(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  source_type text not null default 'paid_purchase'
    check (source_type in ('paid_purchase')),
  original_quantity numeric(20,8) not null check (original_quantity > 0),
  remaining_quantity numeric(20,8) not null check (
    remaining_quantity >= 0 and remaining_quantity <= original_quantity
  ),
  amount_paid_ngn numeric(20,8) not null check (amount_paid_ngn > 0),
  backing_value_per_coin_ngn numeric(24,12) not null check (backing_value_per_coin_ngn > 0),
  created_at timestamptz not null default now()
);

create index if not exists spike_coin_purchase_lots_fifo_idx
  on private.spike_coin_purchase_lots(user_id, created_at, id)
  where remaining_quantity > 0;

alter table private.spike_coin_purchase_lots enable row level security;
revoke all on table private.spike_coin_purchase_lots from public, anon, authenticated;
comment on table private.spike_coin_purchase_lots is
  'Private, immutable purchase provenance for paid SP Coins; remaining_quantity is reserved for atomic FIFO gift settlement.';

create or replace function private.capture_spike_paid_coin_lot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_id uuid;
  v_order public.spike_purchase_orders%rowtype;
  v_inserted_id uuid;
begin
  if new.entry_type is distinct from 'credit'
     or new.currency is distinct from 'SPIKE_COIN'
     or new.reference is null
     or new.reference !~ '^spike_purchase_order:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return new;
  end if;

  v_order_id := substring(new.reference from '^spike_purchase_order:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid;

  select * into v_order
  from public.spike_purchase_orders
  where id = v_order_id
  for update;

  if not found
     or v_order.user_id <> new.user_id
     or v_order.product_type <> 'coin'
     or v_order.status <> 'payment_reported'
     or coalesce(v_order.coin_amount, 0) <= 0
     or coalesce(v_order.amount_ngn, 0) <= 0
     or new.amount <> v_order.coin_amount then
    raise exception 'Paid SP Coin provenance validation failed for wallet credit.';
  end if;

  insert into private.spike_coin_purchase_lots (
    purchase_order_id,
    wallet_ledger_id,
    user_id,
    source_type,
    original_quantity,
    remaining_quantity,
    amount_paid_ngn,
    backing_value_per_coin_ngn
  ) values (
    v_order.id,
    new.id,
    v_order.user_id,
    'paid_purchase',
    v_order.coin_amount,
    v_order.coin_amount,
    v_order.amount_ngn,
    v_order.amount_ngn / v_order.coin_amount
  )
  on conflict (purchase_order_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    raise exception 'A provenance lot already exists for this purchase; duplicate wallet credit blocked.';
  end if;

  return new;
end;
$function$;

revoke all on function private.capture_spike_paid_coin_lot() from public, anon, authenticated;

drop trigger if exists spike_capture_paid_coin_lot_after_wallet_credit on public.wallet_ledger;
create trigger spike_capture_paid_coin_lot_after_wallet_credit
after insert on public.wallet_ledger
for each row
execute function private.capture_spike_paid_coin_lot();
