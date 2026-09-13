-- Server-authoritative private Trusted Contacts list.
create table if not exists public.spike_safety_trusted_contacts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(owner_id,contact_id),
  check(owner_id<>contact_id)
);
alter table public.spike_safety_trusted_contacts enable row level security;
revoke all on public.spike_safety_trusted_contacts from anon, authenticated;

create or replace function public.spike_set_trusted_contacts(p_contact_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_uid uuid:=auth.uid(); v_ids uuid[]; v_count integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if coalesce(array_length(p_contact_ids,1),0) > 5 then raise exception 'You can select up to 5 trusted contacts'; end if;
  v_ids:=array(select distinct x from unnest(coalesce(p_contact_ids,array[]::uuid[])) x where x is not null and x<>v_uid);
  select count(*) into v_count from unnest(v_ids);
  if v_count<>coalesce(array_length(v_ids,1),0) then raise exception 'Invalid trusted contacts'; end if;
  if exists(select 1 from unnest(v_ids) x left join auth.users u on u.id=x where u.id is null) then raise exception 'One or more trusted contacts no longer exist'; end if;
  delete from public.spike_safety_trusted_contacts where owner_id=v_uid and not(contact_id=any(v_ids));
  insert into public.spike_safety_trusted_contacts(owner_id,contact_id)
  select v_uid,x from unnest(v_ids) x on conflict do nothing;
  return jsonb_build_object('ok',true,'count',coalesce(array_length(v_ids,1),0));
end;
$$;

create or replace function public.spike_get_trusted_contacts()
returns table(contact_id uuid)
language sql
security definer stable
set search_path=public
as $$ select contact_id from public.spike_safety_trusted_contacts where owner_id=auth.uid() order by created_at; $$;

revoke all on function public.spike_set_trusted_contacts(uuid[]) from public,anon;
grant execute on function public.spike_set_trusted_contacts(uuid[]) to authenticated;
revoke all on function public.spike_get_trusted_contacts() from public,anon;
grant execute on function public.spike_get_trusted_contacts() to authenticated;
