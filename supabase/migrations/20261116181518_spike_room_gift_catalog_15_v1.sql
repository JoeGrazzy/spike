-- SPIKE: expand the existing room gift catalogue to 15 universally available gifts.
-- Preserve gift IDs for existing Rose, Diamond and Crown records so historical references remain valid.
-- Existing settlement policy remains: 70% creator gross, 15% SPIKE base, 15% reward pool;
-- the existing creator-earning policy applies the 10% creator earnings retention.
BEGIN;

INSERT INTO public.spike_gifts (
  gift_type, icon, name, coin_cost, value_minor, receiver_minor, pool_minor, spike_minor, active
) VALUES
  ('rose','🌹','Rose',5,1000,700,150,150,true),
  ('love_heart','💖','Love Heart',10,2000,1400,300,300,true),
  ('star','⭐','Star',20,4000,2800,600,600,true),
  ('tulip','🌷','Tulip',30,6000,4200,900,900,true),
  ('trophy','🏆','Trophy',50,10000,7000,1500,1500,true),
  ('diamond','💎','Diamond',100,20000,14000,3000,3000,true),
  ('crown','👑','Crown',200,40000,28000,6000,6000,true),
  ('supercar','🏎️','Supercar',350,70000,49000,10500,10500,true),
  ('yacht','🛥️','Yacht',500,100000,70000,15000,15000,true),
  ('fireworks','🎆','Fireworks',750,150000,105000,22500,22500,true),
  ('superbike','🏍️','Superbike',1000,200000,140000,30000,30000,true),
  ('phoenix','🔥','Phoenix',1500,300000,210000,45000,45000,true),
  ('private_jet','✈️','Private Jet',2500,500000,350000,75000,75000,true),
  ('royal_palace','🏰','Royal Palace',5000,1000000,700000,150000,150000,true),
  ('legendary_dragon','🐉','Legendary Dragon',10000,2000000,1400000,300000,300000,true)
ON CONFLICT (gift_type) DO UPDATE SET
  icon=EXCLUDED.icon,
  name=EXCLUDED.name,
  coin_cost=EXCLUDED.coin_cost,
  value_minor=EXCLUDED.value_minor,
  receiver_minor=EXCLUDED.receiver_minor,
  pool_minor=EXCLUDED.pool_minor,
  spike_minor=EXCLUDED.spike_minor,
  active=true;

-- Retire old catalogue entries without deleting records referenced by gift history.
UPDATE public.spike_gifts
SET active=false
WHERE gift_type NOT IN (
  'rose','love_heart','star','tulip','trophy','diamond','crown','supercar',
  'yacht','fireworks','superbike','phoenix','private_jet','royal_palace','legendary_dragon'
);

COMMIT;
