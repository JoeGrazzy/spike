-- SPIKE Profile: permanently repair 42501 on the profiles UPDATE RLS policy.
-- Root cause: profiles_update_own invokes public.spike_coins_unchanged(...),
-- but the function ACL granted EXECUTE only to service_role/postgres.
-- The authenticated role therefore failed before the RLS expression could finish.

create or replace function public.spike_coins_unchanged(p_user_id uuid, p_new_coins integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select auth.uid()) = p_user_id
     and coalesce(
       (select p.coins from public.profiles as p where p.id = p_user_id),
       p_new_coins
     ) = p_new_coins;
$$;

-- Keep ownership on the trusted database owner; do not transfer ownership to
-- anon/authenticated/service_role. SECURITY DEFINER must remain tightly owned.
alter function public.spike_coins_unchanged(uuid, integer) owner to postgres;

-- Explicit least-privilege ACL: authenticated needs EXECUTE because the
-- function is referenced by its own profiles RLS policy. It is not an app RPC.
revoke all on function public.spike_coins_unchanged(uuid, integer) from public;
revoke all on function public.spike_coins_unchanged(uuid, integer) from anon;
revoke all on function public.spike_coins_unchanged(uuid, integer) from authenticator;
grant execute on function public.spike_coins_unchanged(uuid, integer) to authenticated;
grant execute on function public.spike_coins_unchanged(uuid, integer) to service_role;

comment on function public.spike_coins_unchanged(uuid, integer) is
'RLS helper: authenticated users may retain, but not alter, their own profile coin balance. SECURITY DEFINER avoids recursive profiles RLS evaluation; execution is restricted to authenticated/service_role.';
