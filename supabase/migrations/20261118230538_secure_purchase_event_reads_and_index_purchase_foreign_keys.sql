-- Purchase event visibility is limited to the order owner and the SPIKE owner.
create policy spike_purchase_events_owner_or_admin_read
on public.spike_purchase_events
for select
to authenticated
using (
  private.is_admin()
  or exists (
    select 1
    from public.spike_purchase_orders o
    where o.id = spike_purchase_events.order_id
      and o.user_id = (select auth.uid())
  )
);

grant select on public.spike_purchase_events to authenticated;

-- Index foreign keys used for joins and referential maintenance.
create index if not exists idx_spike_purchase_events_actor_id
  on public.spike_purchase_events(actor_id)
  where actor_id is not null;

create index if not exists idx_spike_purchase_orders_reviewed_by
  on public.spike_purchase_orders(reviewed_by)
  where reviewed_by is not null;

create index if not exists idx_spike_verified_subscriptions_last_order_id
  on public.spike_verified_subscriptions(last_order_id);
