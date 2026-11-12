-- Server-side WebAuthn credential registry used by the Safety Center.
create table if not exists public.spike_safety_passkeys (
  credential_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists spike_safety_passkeys_user_idx on public.spike_safety_passkeys(user_id);
alter table public.spike_safety_passkeys enable row level security;
revoke all on public.spike_safety_passkeys from anon, authenticated;

create table if not exists public.spike_safety_webauthn_challenges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  challenge text not null,
  purpose text not null check(purpose in ('registration','authentication')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.spike_safety_webauthn_challenges enable row level security;
revoke all on public.spike_safety_webauthn_challenges from anon, authenticated;


create table if not exists public.spike_safety_webauthn_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check(purpose in ('registration','authentication')),
  created_at timestamptz not null default now()
);
create index if not exists spike_safety_webauthn_attempts_user_idx on public.spike_safety_webauthn_attempts(user_id,purpose,created_at desc);
alter table public.spike_safety_webauthn_attempts enable row level security;
revoke all on public.spike_safety_webauthn_attempts from anon, authenticated;
