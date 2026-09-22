-- SPIKE feature completion pass v1
-- Completes cross-user discovery for Feature Center data and makes poll/series
-- creation atomic so partial client failures cannot leave orphaned records.

-- Discovery reads: mutations remain owner/participant protected by existing RLS.
drop policy if exists spike_polls_authenticated_select on public.spike_polls;
create policy spike_polls_authenticated_select
  on public.spike_polls for select to authenticated using (true);

drop policy if exists spike_poll_options_authenticated_select on public.spike_poll_options;
create policy spike_poll_options_authenticated_select
  on public.spike_poll_options for select to authenticated using (true);

drop policy if exists spike_series_authenticated_select on public.spike_signal_series;
create policy spike_series_authenticated_select
  on public.spike_signal_series for select to authenticated using (true);

drop policy if exists spike_series_items_authenticated_select on public.spike_series_items;
create policy spike_series_items_authenticated_select
  on public.spike_series_items for select to authenticated using (true);

drop policy if exists spike_collab_authenticated_select on public.spike_signal_collaborators;
create policy spike_collab_authenticated_select
  on public.spike_signal_collaborators for select to authenticated
  using (owner_id = (select auth.uid()) or collaborator_id = (select auth.uid()));

drop policy if exists spike_memberships_authenticated_select on public.spike_creator_memberships;
create policy spike_memberships_authenticated_select
  on public.spike_creator_memberships for select to authenticated
  using (active = true or creator_id = (select auth.uid()));

drop policy if exists spike_products_authenticated_select on public.spike_creator_products;
create policy spike_products_authenticated_select
  on public.spike_creator_products for select to authenticated
  using (active = true or creator_id = (select auth.uid()));

-- Atomic poll creation.
create or replace function public.spike_create_poll(p_question text, p_options text[])
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_poll_id uuid;
  v_options text[];
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_question is null or char_length(trim(p_question)) < 2 or char_length(p_question) > 500 then
    raise exception 'Poll question must be between 2 and 500 characters';
  end if;
  select coalesce(array_agg(trim(x) order by ord), '{}'::text[])
    into v_options
  from unnest(coalesce(p_options, '{}'::text[])) with ordinality as t(x,ord)
  where char_length(trim(x)) between 1 and 200;
  if coalesce(array_length(v_options,1),0) < 2 then raise exception 'A poll needs at least two valid options'; end if;
  if array_length(v_options,1) > 8 then raise exception 'A poll can have at most eight options'; end if;
  if (select count(*) from unnest(v_options) x) <> (select count(distinct x) from unnest(v_options) x) then
    raise exception 'Poll options must be unique';
  end if;

  insert into public.spike_polls(owner_id,question)
  values (v_uid,trim(p_question))
  returning id into v_poll_id;

  insert into public.spike_poll_options(poll_id,label,position)
  select v_poll_id, x, ord-1 from unnest(v_options) with ordinality as t(x,ord);

  return jsonb_build_object('id',v_poll_id,'question',trim(p_question),'options',to_jsonb(v_options));
end
$$;

revoke all on function public.spike_create_poll(text,text[]) from public, anon;
grant execute on function public.spike_create_poll(text,text[]) to authenticated;

-- Atomic Signal Series creation.
create or replace function public.spike_create_signal_series(
  p_title text,
  p_description text,
  p_post_ids text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_series_id uuid;
  v_ids text[];
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_title is null or char_length(trim(p_title)) < 2 or char_length(p_title) > 120 then
    raise exception 'Series title must be between 2 and 120 characters';
  end if;

  select coalesce(array_agg(trim(x) order by ord), '{}'::text[])
    into v_ids
  from unnest(coalesce(p_post_ids, '{}'::text[])) with ordinality as t(x,ord)
  where char_length(trim(x)) between 1 and 200;
  if coalesce(array_length(v_ids,1),0) > 30 then raise exception 'A Series can contain at most 30 Signals'; end if;

  insert into public.spike_signal_series(owner_id,title,description)
  values (v_uid,trim(p_title),coalesce(trim(p_description),''))
  returning id into v_series_id;

  if coalesce(array_length(v_ids,1),0) > 0 then
    insert into public.spike_series_items(series_id,post_id,position,title)
    select v_series_id,x,ord-1,'Part '||ord
    from unnest(v_ids) with ordinality as t(x,ord);
  end if;

  return jsonb_build_object('id',v_series_id,'title',trim(p_title),'item_count',coalesce(array_length(v_ids,1),0));
end
$$;

revoke all on function public.spike_create_signal_series(text,text,text[]) from public, anon;
grant execute on function public.spike_create_signal_series(text,text,text[]) to authenticated;
