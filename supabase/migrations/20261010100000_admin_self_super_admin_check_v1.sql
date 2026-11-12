-- Self-only super-admin check for browser clients.
-- Avoid exposing public.is_super_admin(user_id) as an arbitrary-user role oracle.
create or replace function public.admin_is_super_admin_self()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'super_admin'
  );
$function$;

revoke all on function public.admin_is_super_admin_self() from public, anon;
grant execute on function public.admin_is_super_admin_self() to authenticated;
