-- Phase 14 / Step 2: public gift presentation separated from private monetization.
-- No commission, platform share, gross backing value, or payout configuration is
-- stored in an API-exposed table or returned to a customer-facing function.

create table if not exists public.spike_gift_catalogue (
  id uuid primary key default gen_random_uuid(),
  gift_key text not null unique check (gift_key ~ '^[a-z0-9_]{2,48}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 64),
  image_url text,
  coin_cost numeric(20,8) not null check (coin_cost > 0),
  is_active boolean not null default false,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.spike_gift_catalogue enable row level security;
revoke all on table public.spike_gift_catalogue from public, anon, authenticated;
grant select on table public.spike_gift_catalogue to authenticated;
drop policy if exists "Active SPIKE gifts are visible to signed-in users" on public.spike_gift_catalogue;
create policy "Active SPIKE gifts are visible to signed-in users"
  on public.spike_gift_catalogue
  for select to authenticated
  using (is_active = true);

comment on table public.spike_gift_catalogue is
  'Customer-facing gift presentation and coin prices only. Internal monetization settings must never be added here.';

create table if not exists private.spike_monetization_settings (
  singleton boolean primary key default true check (singleton),
  creator_share_rate numeric(7,6) not null default 0.700000
    check (creator_share_rate >= 0 and creator_share_rate <= 1),
  minimum_withdrawal_ngn numeric(20,2) not null default 2000.00
    check (minimum_withdrawal_ngn >= 0),
  gifting_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict
);

alter table private.spike_monetization_settings enable row level security;
revoke all on table private.spike_monetization_settings from public, anon, authenticated;
comment on table private.spike_monetization_settings is
  'STRICTLY PRIVATE server-side business configuration. Never expose commission/share values, directly or indirectly, to customer clients.';

insert into private.spike_monetization_settings(singleton)
values (true)
on conflict (singleton) do nothing;

-- No public RPC is created for reading or changing this configuration.
-- Future admin controls must call a server-side endpoint that authenticates the
-- signed-in owner using private.is_admin(), validates values, writes an audit
-- record, and returns only a generic success result (never the commission rate).
