begin;

-- Publish exactly six affordable SP Coin packages and two Verified plans.
-- Keep historical product rows so existing purchase orders retain their SKU references.
update public.spike_purchase_products
set is_active = false, updated_at = now()
where sku not in (
  'coin_mini',
  'coin_basic',
  'coin_starter',
  'coin_popular',
  'coin_value',
  'coin_premium',
  'verified_monthly',
  'verified_yearly'
);

insert into public.spike_purchase_products
  (sku, title, product_type, amount_ngn, coin_amount, duration_days, is_active, updated_at)
values
  ('coin_mini',        'Mini',                     'coin',     100,  20,   null, true, now()),
  ('coin_basic',       'Basic',                    'coin',     250,  55,   null, true, now()),
  ('coin_starter',     'Starter',                  'coin',     500, 120,   null, true, now()),
  ('coin_popular',     'Popular',                  'coin',    1000, 260,   null, true, now()),
  ('coin_value',       'Value',                    'coin',    2000, 550,   null, true, now()),
  ('coin_premium',     'Premium',                  'coin',    5000,1450,   null, true, now()),
  ('verified_monthly', 'SPIKE Verified · Monthly', 'verified', 300, null, 30, true, now()),
  ('verified_yearly',  'SPIKE Verified · Yearly',  'verified',2500, null,365, true, now())
on conflict (sku) do update set
  title = excluded.title,
  product_type = excluded.product_type,
  amount_ngn = excluded.amount_ngn,
  coin_amount = excluded.coin_amount,
  duration_days = excluded.duration_days,
  is_active = true,
  updated_at = now();

commit;
