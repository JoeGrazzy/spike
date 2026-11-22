-- Restore the owner purchase queue used by admin.html.
-- Customers can still only report their own orders; only the SPIKE owner can list all orders.
create or replace function public.spike_admin_list_purchase_orders()
returns setof jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, private
as $function$
begin
  if not private.is_admin() then
    raise exception 'Only the SPIKE owner can view purchase requests.';
  end if;

  return query
  select to_jsonb(o) || jsonb_build_object(
    'user_email', u.email,
    'display_name', coalesce(
      nullif(to_jsonb(p)->>'display_name', ''),
      nullif(to_jsonb(p)->>'full_name', ''),
      nullif(to_jsonb(p)->>'username', ''),
      u.email,
      o.user_id::text
    ),
    'username', to_jsonb(p)->>'username',
    'spike_id', to_jsonb(p)->>'spike_id'
  )
  from public.spike_purchase_orders o
  left join public.profiles p on p.id = o.user_id
  left join auth.users u on u.id = o.user_id
  order by
    case o.status when 'payment_reported' then 0 when 'pending_payment' then 1 else 2 end,
    o.created_at desc;
end;
$function$;

revoke all on function public.spike_admin_list_purchase_orders() from public, anon;
grant execute on function public.spike_admin_list_purchase_orders() to authenticated;
