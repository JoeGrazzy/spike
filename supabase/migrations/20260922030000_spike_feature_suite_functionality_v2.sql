-- SPIKE Feature Suite functionality completion v2.
-- Public/authenticated discovery is read-only; mutations remain owner/RPC guarded.

alter table public.spike_polls enable row level security;
alter table public.spike_poll_options enable row level security;
alter table public.spike_signal_series enable row level security;
alter table public.spike_series_items enable row level security;
alter table public.spike_signal_collaborators enable row level security;
alter table public.spike_creator_memberships enable row level security;
alter table public.spike_creator_products enable row level security;
alter table public.spike_membership_members enable row level security;

drop policy if exists spike_polls_authenticated_select on public.spike_polls;
create policy spike_polls_authenticated_select on public.spike_polls for select to authenticated using (true);
drop policy if exists spike_poll_options_authenticated_select on public.spike_poll_options;
create policy spike_poll_options_authenticated_select on public.spike_poll_options for select to authenticated using (true);
drop policy if exists spike_series_authenticated_select on public.spike_signal_series;
create policy spike_series_authenticated_select on public.spike_signal_series for select to authenticated using (true);
drop policy if exists spike_series_items_authenticated_select on public.spike_series_items;
create policy spike_series_items_authenticated_select on public.spike_series_items for select to authenticated using (true);
drop policy if exists spike_collab_authenticated_select on public.spike_signal_collaborators;
create policy spike_collab_authenticated_select on public.spike_signal_collaborators for select to authenticated using (owner_id=auth.uid() or collaborator_id=auth.uid());
drop policy if exists spike_memberships_authenticated_select on public.spike_creator_memberships;
create policy spike_memberships_authenticated_select on public.spike_creator_memberships for select to authenticated using (active=true or creator_id=auth.uid());
drop policy if exists spike_products_authenticated_select on public.spike_creator_products;
create policy spike_products_authenticated_select on public.spike_creator_products for select to authenticated using (active=true or creator_id=auth.uid());
drop policy if exists spike_membership_members_self_select on public.spike_membership_members;
create policy spike_membership_members_self_select on public.spike_membership_members for select to authenticated using (member_id=auth.uid() or exists(select 1 from public.spike_creator_memberships m where m.id=membership_id and m.creator_id=auth.uid()));

create or replace function public.spike_signal_collaboration_respond(p_post_id text,p_owner_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); v_status text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_owner_id is null or p_post_id is null or trim(p_post_id)='' then raise exception 'Invalid collaboration request'; end if;
  if not exists(select 1 from public.spike_signal_collaborators where post_id=trim(p_post_id) and owner_id=p_owner_id and collaborator_id=uid and status='pending') then raise exception 'Collaboration request not found'; end if;
  v_status:=case when p_accept then 'accepted' else 'declined' end;
  update public.spike_signal_collaborators set status=v_status,responded_at=now() where post_id=trim(p_post_id) and owner_id=p_owner_id and collaborator_id=uid;
  return jsonb_build_object('ok',true,'status',v_status,'post_id',trim(p_post_id));
end $$;
revoke all on function public.spike_signal_collaboration_respond(text,uuid,boolean) from public,anon;
grant execute on function public.spike_signal_collaboration_respond(text,uuid,boolean) to authenticated;
