begin;
create or replace function public.spike_admin_phase14_overview()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $fn$
begin
  if not private.is_admin() then raise exception 'owner_only' using errcode='42501'; end if;
  return jsonb_build_object(
    'gifts_enabled',(select gifts_enabled from private.spike_monetization_settings where singleton),
    'withdrawals_enabled',(select withdrawals_enabled from private.spike_monetization_settings where singleton),
    'gift_count',(select count(*) from private.spike_gift_events),
    'active_gifts',(select count(*) from private.spike_gift_catalog where is_active),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('id',id,'gift_key',gift_key,'title',title,'image_url',image_url,'coin_cost',coin_cost,'is_active',is_active,'sort_order',sort_order) order by sort_order,title) from private.spike_gift_catalog),'[]'::jsonb),
    'creator_earnings_ngn',(select coalesce(sum(creator_amount_ngn),0) from private.spike_creator_earnings where status <> 'reversed'),
    'platform_revenue_ngn',(select coalesce(sum(platform_amount_ngn),0) from private.spike_platform_revenue),
    'paid_coin_lots',(select count(*) from private.spike_coin_purchase_lots where remaining_quantity > 0)
  );
end $fn$;

create or replace function public.spike_admin_upsert_gift(
 p_gift_id uuid, p_gift_key text, p_title text, p_image_url text, p_coin_cost integer, p_is_active boolean, p_sort_order integer default 100
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $fn$
declare v_id uuid;
begin
 if not private.is_admin() then raise exception 'owner_only' using errcode='42501'; end if;
 if p_gift_key !~ '^[a-z0-9][a-z0-9_-]{1,59}$' or length(btrim(p_title)) not between 1 and 80 or p_coin_cost <= 0 then
   raise exception 'invalid_gift_details' using errcode='22023';
 end if;
 if p_image_url is not null and (p_image_url !~ '^https://') then raise exception 'image_must_use_https' using errcode='22023'; end if;
 if p_gift_id is null then
   insert into private.spike_gift_catalog(gift_key,title,image_url,coin_cost,is_active,sort_order)
   values(p_gift_key,btrim(p_title),nullif(btrim(p_image_url),''),p_coin_cost,p_is_active,coalesce(p_sort_order,100)) returning id into v_id;
 else
   update private.spike_gift_catalog set gift_key=p_gift_key,title=btrim(p_title),image_url=nullif(btrim(p_image_url),''),coin_cost=p_coin_cost,is_active=p_is_active,sort_order=coalesce(p_sort_order,100),updated_at=now()
   where id=p_gift_id returning id into v_id;
   if v_id is null then raise exception 'gift_not_found' using errcode='P0002'; end if;
 end if;
 return v_id;
end $fn$;

create or replace function public.spike_admin_set_gifts_enabled(p_enabled boolean)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $fn$
begin
 if not private.is_admin() then raise exception 'owner_only' using errcode='42501'; end if;
 if p_enabled and not exists(select 1 from private.spike_gift_catalog where is_active) then raise exception 'add_active_gift_first' using errcode='22023'; end if;
 update private.spike_monetization_settings set gifts_enabled=p_enabled,updated_at=now(),updated_by=auth.uid() where singleton;
 return p_enabled;
end $fn$;

revoke all on function public.spike_admin_phase14_overview() from public, anon, authenticated;
revoke all on function public.spike_admin_upsert_gift(uuid,text,text,text,integer,boolean,integer) from public, anon, authenticated;
revoke all on function public.spike_admin_set_gifts_enabled(boolean) from public, anon, authenticated;
grant execute on function public.spike_admin_phase14_overview() to authenticated;
grant execute on function public.spike_admin_upsert_gift(uuid,text,text,text,integer,boolean,integer) to authenticated;
grant execute on function public.spike_admin_set_gifts_enabled(boolean) to authenticated;
commit;
