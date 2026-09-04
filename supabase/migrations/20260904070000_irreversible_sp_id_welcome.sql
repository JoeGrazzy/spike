create or replace function public.prevent_sp_id_welcome_reset()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.sp_id_welcome_seen is true and new.sp_id_welcome_seen is distinct from true then
    raise exception 'sp_id_welcome_seen is irreversible once claimed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_sp_id_welcome_immutable on public.profiles;
create trigger trg_profiles_sp_id_welcome_immutable
before update of sp_id_welcome_seen on public.profiles
for each row execute function public.prevent_sp_id_welcome_reset();

create or replace function public.claim_sp_id_welcome()
returns table(sp_id text)
language sql
security invoker
set search_path = public
as $$
  update public.profiles
     set sp_id_welcome_seen = true,
         updated_at = now()
   where id = (select auth.uid())
     and sp_id is not null
     and sp_id_welcome_seen = false
  returning public.profiles.sp_id;
$$;

revoke all on function public.claim_sp_id_welcome() from public;
grant execute on function public.claim_sp_id_welcome() to authenticated;
revoke all on function public.prevent_sp_id_welcome_reset() from public;
