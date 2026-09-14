-- SPIKE language backend
alter table public.user_app_settings add column if not exists language_code text not null default 'en' check (language_code in ('en','fr','ig','yo','ha','pcm'));
create table if not exists public.spike_i18n_packs (language_code text primary key check (language_code in ('en','fr','ig','yo','ha','pcm')), display_name text not null, translations jsonb not null default '{}'::jsonb, version integer not null default 1, updated_at timestamptz not null default now());
alter table public.spike_i18n_packs enable row level security;
revoke all on public.spike_i18n_packs from anon, authenticated;
grant select on public.spike_i18n_packs to anon, authenticated;
drop policy if exists spike_i18n_packs_public_read on public.spike_i18n_packs;
create policy spike_i18n_packs_public_read on public.spike_i18n_packs for select to anon, authenticated using (true);
