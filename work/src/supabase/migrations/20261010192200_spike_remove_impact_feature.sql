-- Permanently decommission the retired SPIKE Impact campaign/donation/payout feature.
-- Keep the historical migrations immutable; this forward migration removes their live database objects.
-- This is intentionally destructive to Impact-only data and does not touch unrelated SPIKE tables.

do $$
declare
  obj record;
begin
  -- Drop all public functions dedicated to the retired feature, regardless of overload/signature.
  for obj in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'spike_impact_%'
  loop
    execute format('drop function if exists %s cascade', obj.signature);
  end loop;

  -- Drop every feature-owned table, including dependent indexes/constraints/triggers.
  for obj in
    select c.oid::regclass as relation
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and c.relname like 'spike_impact_%'
  loop
    execute format('drop table if exists %s cascade', obj.relation);
  end loop;
end $$;
