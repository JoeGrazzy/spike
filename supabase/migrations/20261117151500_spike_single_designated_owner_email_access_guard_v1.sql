CREATE OR REPLACE FUNCTION private.spike_is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.users AS u
    JOIN private.spike_owner_authority AS a ON a.owner_user_id = u.id
    WHERE u.id = (SELECT auth.uid())
      AND lower(btrim(coalesce(u.email, ''))) = 'eletexjoeytex@gmail.com'
      AND a.singleton = true AND a.active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.admin_owner_access_check()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL AND private.spike_is_owner();
$function$;

REVOKE ALL ON FUNCTION public.admin_owner_access_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_owner_access_check() TO authenticated;
REVOKE ALL ON FUNCTION private.spike_is_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.spike_is_owner() TO postgres, service_role;
