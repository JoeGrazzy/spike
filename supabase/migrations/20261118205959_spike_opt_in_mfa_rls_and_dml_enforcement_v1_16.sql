create or replace function private.mfa_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    not exists (
      select 1
      from auth.mfa_factors f
      where f.user_id = (select auth.uid())
        and f.status = 'verified'
    )
    or coalesce((select auth.jwt() ->> 'aal') = 'aal2', false);
$function$;

revoke all on function private.mfa_access_allowed() from public, anon;
grant execute on function private.mfa_access_allowed() to authenticated;

create or replace function private.enforce_mfa_for_opted_in_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if not private.mfa_access_allowed() then
    raise exception 'Complete multi-factor authentication before changing account data'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_mfa_for_opted_in_user() from public, anon, authenticated;

do $block$
declare
  t record;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists mfa_opt_in_enforcement on public.%I',
      t.tablename
    );
    execute format(
      'create policy mfa_opt_in_enforcement on public.%I as restrictive for all to authenticated using ((select private.mfa_access_allowed())) with check ((select private.mfa_access_allowed()))',
      t.tablename
    );

    execute format(
      'drop trigger if exists spike_mfa_opt_in_guard on public.%I',
      t.tablename
    );
    execute format(
      'create trigger spike_mfa_opt_in_guard before insert or update or delete on public.%I for each row execute function private.enforce_mfa_for_opted_in_user()',
      t.tablename
    );
  end loop;
end;
$block$;

drop policy if exists mfa_opt_in_enforcement on storage.objects;
create policy mfa_opt_in_enforcement
  on storage.objects
  as restrictive
  for all
  to authenticated
  using ((select private.mfa_access_allowed()))
  with check ((select private.mfa_access_allowed()));

create or replace function private.get_spike_follow_counts(p_owner uuid)
returns table(followers bigint, following bigint)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select
    (select count(*) from public.follows f where f.following_id=p_owner and f.status='accepted'
      and not private.is_blocked(auth.uid(),f.follower_id)),
    (select count(*) from public.follows f where f.follower_id=p_owner and f.status='accepted'
      and not private.is_blocked(auth.uid(),f.following_id))
  where private.mfa_access_allowed()
    and private.can_view_profile(p_owner);
$function$;

create or replace function private.get_spike_follow_list(
  p_owner uuid,
  p_kind text,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  spike_id text,
  created_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  if not private.mfa_access_allowed() then
    raise exception 'Complete multi-factor authentication before viewing account data'
      using errcode='42501';
  end if;
  if p_kind not in ('followers','following','mutuals') then
    raise exception 'Invalid list type' using errcode='22023';
  end if;
  if not private.can_view_profile(p_owner) then
    raise exception 'Profile is not visible' using errcode='42501';
  end if;
  return query
  select p.id,p.username,p.display_name,
    case when p.avatar_path is null then null when p.avatar_path like 'http%' then p.avatar_path
      else 'https://veagqanfilmbchlvlpcc.supabase.co/storage/v1/object/public/avatars/'||p.avatar_path end,
    p.spike_id,p.created_at
  from public.profiles p
  where p.account_status='active'
    and (
      (p_kind='followers' and exists(select 1 from public.follows f where f.follower_id=p.id and f.following_id=p_owner and f.status='accepted'))
      or (p_kind='following' and exists(select 1 from public.follows f where f.follower_id=p_owner and f.following_id=p.id and f.status='accepted'))
      or (p_kind='mutuals' and exists(select 1 from public.follows f where f.follower_id=p.id and f.following_id=p_owner and f.status='accepted')
          and exists(select 1 from public.follows f where f.follower_id=p_owner and f.following_id=p.id and f.status='accepted'))
    )
    and not private.is_blocked(auth.uid(),p.id)
  order by p.created_at desc
  limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(coalesce(p_offset,0),0);
end;
$function$;
