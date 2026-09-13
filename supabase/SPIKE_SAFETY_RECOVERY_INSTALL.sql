-- SPIKE Safety Center: server-authoritative Safety Code recovery.
-- The browser never gets a service-role key. Safety Codes are verified as hashes,
-- and recovery links are short-lived, single-use bearer tokens.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.spike_safety_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null,
  code_version bigint not null default 1,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table if not exists public.spike_safety_recovery_attempts (
  id bigint generated always as identity primary key,
  actor_admin_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  success boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.spike_safety_recovery_tokens (
  id bigint generated always as identity primary key,
  token_hash text not null unique,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  issued_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists spike_safety_recovery_attempts_admin_created_idx
  on public.spike_safety_recovery_attempts(actor_admin_id, created_at desc);
create index if not exists spike_safety_recovery_attempts_target_created_idx
  on public.spike_safety_recovery_attempts(target_user_id, created_at desc);
create index if not exists spike_safety_recovery_tokens_expiry_idx
  on public.spike_safety_recovery_tokens(expires_at);

alter table public.spike_safety_codes enable row level security;
alter table public.spike_safety_recovery_attempts enable row level security;
alter table public.spike_safety_recovery_tokens enable row level security;

revoke all on public.spike_safety_codes from anon, authenticated;
revoke all on public.spike_safety_recovery_attempts from anon, authenticated;
revoke all on public.spike_safety_recovery_tokens from anon, authenticated;

-- Hash and register the user's current Safety Code. The plaintext code is never
-- persisted server-side and is never returned by this function.
create or replace function public.spike_register_safety_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code,'')));
  v_version bigint;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_code !~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}$' then raise exception 'Invalid Safety Code format'; end if;

  insert into public.spike_safety_codes(user_id,code_hash,code_version,created_at,rotated_at,disabled_at)
  values(v_uid,encode(extensions.digest(v_code,'sha256'),'hex'),1,now(),now(),null)
  on conflict(user_id) do update set
    code_hash=excluded.code_hash,
    code_version=public.spike_safety_codes.code_version+1,
    rotated_at=now(),
    disabled_at=null
  returning code_version into v_version;

  return jsonb_build_object('ok',true,'version',v_version);
end;
$$;

-- Admin verifies a code without learning/storing the user's plaintext code.
-- Rate limit: max 8 attempts per admin per 10 minutes.
create or replace function public.admin_verify_safety_code(p_code text)
returns table(user_id uuid, display_name text, username text, email text, sp_id text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code,'')));
  v_hash text;
  v_count integer;
  v_uid uuid;
begin
  if v_admin is null or not public.admin_guard() then raise exception 'Administrator authorization required'; end if;
  if v_code !~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}$' then raise exception 'Invalid Safety Code format'; end if;

  select count(*) into v_count
  from public.spike_safety_recovery_attempts
  where actor_admin_id=v_admin and created_at > now()-interval '10 minutes';
  if v_count >= 8 then raise exception 'Too many recovery attempts. Try again later.'; end if;

  v_hash := encode(extensions.digest(v_code,'sha256'),'hex');
  select s.user_id into v_uid
  from public.spike_safety_codes s
  where s.code_hash=v_hash and s.disabled_at is null
  order by s.rotated_at desc
  limit 1;

  insert into public.spike_safety_recovery_attempts(actor_admin_id,target_user_id,success,reason)
  values(v_admin,v_uid,v_uid is not null,case when v_uid is null then 'code_not_found' else 'code_verified' end);

  if v_uid is null then return; end if;

  return query
  select p.id, coalesce(p.display_name,p.username,'SPIKE User'), p.username,
         au.email, p.sp_id
  from public.profiles p
  join auth.users au on au.id=p.id
  where p.id=v_uid;
end;
$$;

-- Verify and issue a short-lived recovery token. The token is returned only to
-- the authorized admin who requested it; only its hash is stored.
create or replace function public.admin_issue_safety_recovery(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code,'')));
  v_hash text;
  v_uid uuid;
  v_token text;
  v_token_hash text;
  v_count integer;
begin
  if v_admin is null or not public.admin_guard() then raise exception 'Administrator authorization required'; end if;
  if v_code !~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}$' then raise exception 'Invalid Safety Code format'; end if;

  select count(*) into v_count
  from public.spike_safety_recovery_attempts
  where actor_admin_id=v_admin and created_at > now()-interval '10 minutes';
  if v_count >= 8 then raise exception 'Too many recovery attempts. Try again later.'; end if;

  v_hash := encode(extensions.digest(v_code,'sha256'),'hex');
  select s.user_id into v_uid
  from public.spike_safety_codes s
  where s.code_hash=v_hash and s.disabled_at is null
  limit 1;

  insert into public.spike_safety_recovery_attempts(actor_admin_id,target_user_id,success,reason)
  values(v_admin,v_uid,v_uid is not null,'recovery_token_request');

  if v_uid is null then raise exception 'Safety Code not recognized'; end if;

  delete from public.spike_safety_recovery_tokens
  where target_user_id=v_uid and used_at is null;

  v_token := encode(gen_random_bytes(32),'hex');
  v_token_hash := encode(extensions.digest(v_token,'sha256'),'hex');
  insert into public.spike_safety_recovery_tokens(token_hash,target_user_id,issued_by,expires_at)
  values(v_token_hash,v_uid,v_admin,now()+interval '15 minutes');

  return jsonb_build_object(
    'ok',true,
    'user_id',v_uid,
    'token',v_token,
    'expires_at',now()+interval '15 minutes'
  );
end;
$$;

-- Consumes the recovery token and replaces the Auth password. No active session
-- is required. The token is atomically claimed before the password is changed.
create or replace function public.spike_consume_safety_recovery(p_token text,p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := encode(extensions.digest(trim(coalesce(p_token,'')),'sha256'),'hex');
  v_row public.spike_safety_recovery_tokens;
  v_email text;
begin
  if length(trim(coalesce(p_token,''))) <> 64 then raise exception 'Invalid recovery token'; end if;
  if length(coalesce(p_new_password,'')) < 8 or length(p_new_password) > 128 then raise exception 'Password must be 8 to 128 characters'; end if;
  if p_new_password !~ '[A-Z]' or p_new_password !~ '[a-z]' or p_new_password !~ '[0-9]' or p_new_password !~ '[^A-Za-z0-9]' then
    raise exception 'Password does not meet the required strength';
  end if;

  select * into v_row
  from public.spike_safety_recovery_tokens
  where token_hash=v_hash and used_at is null and expires_at>now()
  for update;
  if not found then raise exception 'Recovery token is invalid or expired'; end if;

  update public.spike_safety_recovery_tokens set used_at=now() where id=v_row.id and used_at is null;
  if not found then raise exception 'Recovery token has already been used'; end if;

  select email into v_email from auth.users where id=v_row.target_user_id;
  if v_email is null then raise exception 'Account no longer exists'; end if;

  update auth.users
  set encrypted_password=extensions.crypt(p_new_password,extensions.gen_salt('bf',10)),
      updated_at=now()
  where id=v_row.target_user_id;

  if not found then raise exception 'Account recovery failed'; end if;

  -- Revoke existing Auth sessions so a recovered account must sign in again.
  delete from auth.sessions where user_id=v_row.target_user_id;

  update public.spike_safety_codes set disabled_at=now() where user_id=v_row.target_user_id;
  delete from public.spike_safety_recovery_tokens where target_user_id=v_row.target_user_id and used_at is null;

  return jsonb_build_object('ok',true,'user_id',v_row.target_user_id,'email',v_email);
end;
$$;

revoke all on function public.spike_register_safety_code(text) from public, anon;
grant execute on function public.spike_register_safety_code(text) to authenticated;
revoke all on function public.admin_verify_safety_code(text) from public, anon;
grant execute on function public.admin_verify_safety_code(text) to authenticated;
revoke all on function public.admin_issue_safety_recovery(text) from public, anon;
grant execute on function public.admin_issue_safety_recovery(text) to authenticated;
revoke all on function public.spike_consume_safety_recovery(text,text) from public, anon;
grant execute on function public.spike_consume_safety_recovery(text,text) to anon, authenticated;


-- Ask PostgREST to refresh its RPC schema cache immediately after deployment.
notify pgrst, 'reload schema';
