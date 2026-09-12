-- SPIKE Safety Code only installer.
-- Run this file in the SAME Supabase project used by SPIKE.
-- Safe to re-run. Does not expose the Safety Code plaintext.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.spike_safety_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null,
  code_version bigint not null default 1,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  disabled_at timestamptz
);

alter table public.spike_safety_codes enable row level security;
revoke all on public.spike_safety_codes from anon, authenticated;

create or replace function public.spike_register_safety_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_version bigint;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_code !~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}$' then
    raise exception 'Invalid Safety Code format';
  end if;

  insert into public.spike_safety_codes
    (user_id, code_hash, code_version, created_at, rotated_at, disabled_at)
  values
    (v_uid,
     encode(extensions.digest(v_code, 'sha256'), 'hex'),
     1,
     now(),
     now(),
     null)
  on conflict (user_id) do update
    set code_hash = excluded.code_hash,
        code_version = public.spike_safety_codes.code_version + 1,
        rotated_at = now(),
        disabled_at = null
  returning code_version into v_version;

  return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;

revoke all on function public.spike_register_safety_code(text) from public, anon;
grant execute on function public.spike_register_safety_code(text) to authenticated;

notify pgrst, 'reload schema';

-- Verification: this must return exactly one row.
-- select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname='public' and p.proname='spike_register_safety_code';
