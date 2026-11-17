begin;

-- A paid subscription alone is not sufficient: the identity review must also be approved.
create or replace function private.spike_user_has_active_verified_room_badge(p_user_id uuid)
returns boolean language sql stable security definer set search_path to '' as $function$
  select p_user_id is not null
    and not private.spike_user_is_restricted(p_user_id)
    and exists (
      select 1 from private.spike_verified_subscriptions s
      join private.spike_verified_identities i on i.user_id=s.user_id
      where s.user_id=p_user_id
        and s.plan in ('monthly','yearly')
        and s.payment_status='approved'
        and s.status='active'
        and s.starts_at<=now()
        and s.expires_at>now()
        and i.status='approved'
    );
$function$;
revoke all on function private.spike_user_has_active_verified_room_badge(uuid) from public,anon,authenticated;

create or replace function private.spike_require_verified_room_access(p_user_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
begin
  if p_user_id is null or not private.spike_user_has_active_verified_room_badge(p_user_id) then
    raise exception 'An active SPIKE Verified subscription with approved identity is required to enter or use rooms. Subscribe from Wallet to continue.' using errcode='42501';
  end if;
end;
$function$;
revoke all on function private.spike_require_verified_room_access(uuid) from public,anon,authenticated;

create or replace function public.spike_room_user_has_active_verified_subscription(p_user_id uuid)
returns boolean language sql stable security definer set search_path to '' as $function$
  select p_user_id is not null and private.spike_user_has_active_verified_room_badge(p_user_id);
$function$;
revoke all on function public.spike_room_user_has_active_verified_subscription(uuid) from public,anon;
grant execute on function public.spike_room_user_has_active_verified_subscription(uuid) to authenticated;

create or replace function public.spike_room_is_active_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path to 'pg_catalog','public','private','auth' as $function$
  select auth.uid() is not null
    and private.spike_user_has_active_verified_room_badge(auth.uid())
    and exists(select 1 from public.spike_room_members m
      where m.room_id=p_room_id and m.user_id=auth.uid() and m.member_state='active');
$function$;
revoke all on function public.spike_room_is_active_member(uuid) from public,anon;
grant execute on function public.spike_room_is_active_member(uuid) to authenticated;

do $discovery$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('public.spike_rooms_discover(integer)'::regprocedure) into v_def;
  v_new:=replace(v_def,'private.spike_user_has_active_verified_subscription(m.user_id)',
    'private.spike_user_has_active_verified_room_badge(m.user_id)');
  if v_new=v_def then raise exception 'Could not update discovery count to require identity-approved badge'; end if;
  execute v_new;
end;
$discovery$;

commit;
