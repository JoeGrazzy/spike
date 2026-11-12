-- Harden native social RLS after initial v2 deployment.
create or replace function public.spike_touch_native_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Avoid overlapping permissive SELECT policies.
drop policy if exists spike_pulses_owner_write on public.spike_pulses;
create policy spike_pulses_owner_insert on public.spike_pulses
  for insert to authenticated with check (author_id=(select auth.uid()));
create policy spike_pulses_owner_update on public.spike_pulses
  for update to authenticated using (author_id=(select auth.uid())) with check (author_id=(select auth.uid()));
create policy spike_pulses_owner_delete on public.spike_pulses
  for delete to authenticated using (author_id=(select auth.uid()));

drop policy if exists spike_signal_topics_write on public.spike_signal_topics;
create policy spike_signal_topics_insert on public.spike_signal_topics
  for insert to authenticated with check (exists(select 1 from public.app_documents p where p.collection_name='posts' and p.document_id=post_id and p.owner_id=(select auth.uid())));
create policy spike_signal_topics_update on public.spike_signal_topics
  for update to authenticated using (exists(select 1 from public.app_documents p where p.collection_name='posts' and p.document_id=post_id and p.owner_id=(select auth.uid()))) with check (exists(select 1 from public.app_documents p where p.collection_name='posts' and p.document_id=post_id and p.owner_id=(select auth.uid())));
create policy spike_signal_topics_delete on public.spike_signal_topics
  for delete to authenticated using (exists(select 1 from public.app_documents p where p.collection_name='posts' and p.document_id=post_id and p.owner_id=(select auth.uid())));
