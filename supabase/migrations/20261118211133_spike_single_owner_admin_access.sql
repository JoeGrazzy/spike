-- Restrict platform-wide administrative authority to the verified owner account.
-- The owner must also retain an active admin profile; email alone is insufficient.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = (select auth.uid())
      and lower(u.email) = 'eletexjoeytex@gmail.com'
      and p.role = 'admin'
      and p.account_status = 'active'
  );
$function$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;
