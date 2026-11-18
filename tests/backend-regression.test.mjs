import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('room leave RPC safely hands off active hosting and is authenticated-only', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261118205843_spike_room_leave_host_handoff_v1_15.sql', import.meta.url), 'utf8');
  assert.match(migration, /function private\.leave_room\(p_room_id uuid\)[\s\S]*?security definer/i);
  assert.match(migration, /v_room\.active_host_id = v_user_id/i);
  assert.match(migration, /set active_host_id = v_next_host/i);
  assert.match(migration, /set status = 'ended'/i);
  assert.match(migration, /revoke all on function public\.spike_rooms_leave\(uuid\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.spike_rooms_leave\(uuid\) to authenticated/i);
});

test('opt-in MFA is enforced by restrictive RLS, DML triggers and Storage policy', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261118205959_spike_opt_in_mfa_rls_and_dml_enforcement_v1_16.sql', import.meta.url), 'utf8');
  assert.match(migration, /auth\.mfa_factors[\s\S]*status = 'verified'/i);
  assert.match(migration, /auth\.jwt\(\)\s*->>\s*'aal'[\s\S]*'aal2'/i);
  assert.match(migration, /as restrictive for all to authenticated/i);
  assert.match(migration, /before insert or update or delete/i);
  assert.match(migration, /on storage\.objects[\s\S]*as restrictive/i);
  assert.match(migration, /private\.mfa_access_allowed\(\)/i);
});

test('admin report console uses deployed report fields and supported status values', () => {
  const controller = fs.readFileSync(new URL('../js/spike-admin-controller.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  assert.match(page, /spike-admin-controller\.js/);
  assert.match(controller, /from\('reports'\)/);
  assert.match(controller, /reviewed_by: state\.user\.id/);
  assert.match(controller, /\['reviewing', 'resolved', 'dismissed'\]/);
  assert.doesNotMatch(page, /value="actioned"|value="closed"|value="payment"|value="system"/);
  assert.match(controller, /button\.disabled = true[\s\S]*not connected to a verified backend workflow/i);
});

test('referral UI does not promise or simulate rewards without a server-side referral engine', () => {
  const page = fs.readFileSync(new URL('../referrals.html', import.meta.url), 'utf8');
  assert.match(page, /referral rewards backend is not active yet/i);
  assert.match(page, /id="copyRefLink"[^>]*disabled/i);
  assert.match(page, /id="shareRefLink"[^>]*disabled/i);
  assert.match(page, /qualification, anti-abuse checks and SP Points settlement must be implemented server-side/i);
});

test('report-only CSP permits the configured Supabase REST and Realtime endpoints', () => {
  const headers = fs.readFileSync(new URL('../_headers', import.meta.url), 'utf8');
  assert.match(headers, /Content-Security-Policy-Report-Only:/);
  assert.match(headers, /connect-src[^;]*https:\/\/veagqanfilmbchlvlpcc\.supabase\.co/);
  assert.match(headers, /connect-src[^;]*wss:\/\/veagqanfilmbchlvlpcc\.supabase\.co/);
  assert.match(headers, /https:\/\/api\.cloudinary\.com/);
});


test('admin user directory is read-only, searchable and uses only real profile and wallet fields', () => {
  const controller = fs.readFileSync(new URL('../js/spike-admin-controller.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  assert.match(controller, /async function loadUsers\(append = false\)/);
  assert.match(controller, /from\('profiles'\)[\s\S]*username,display_name,spike_id,role,account_status/);
  assert.match(controller, /from\('wallet_accounts'\)[\s\S]*available_balance,pending_balance/);
  assert.match(controller, /This directory is read-only/);
  assert.match(controller, /account directory and report moderation are available/);
  const userLoader = controller.slice(controller.indexOf('async function loadUsers'), controller.indexOf('async function renderUserDetail'));
  assert.doesNotMatch(userLoader, /\.update\(/);
  assert.match(page, /data-view="users"/);
  assert.match(page, /value="suspended"/);
  assert.doesNotMatch(page, /value="pending_activation"|value="profile_missing"/);
});

test('admin dashboard hides unsupported metrics and counts suspended accounts accurately', () => {
  const controller = fs.readFileSync(new URL('../js/spike-admin-controller.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  assert.match(controller, /eq\('account_status', 'suspended'\)/);
  assert.match(controller, /closest\('article'\)\?\.setAttribute\('hidden'/);
  assert.match(page, /4 live metrics/);
});

test('referral page does not promise unconfigured SP Points rewards', () => {
  const page = fs.readFileSync(new URL('../referrals.html', import.meta.url), 'utf8');
  assert.match(page, /Grow SPIKE together/);
  assert.doesNotMatch(page, /Earn SP Points/);
});

test('admin console is restricted to the single owner email in both page guard and controller', () => {
  const controller = fs.readFileSync(new URL('../js/spike-admin-controller.js', import.meta.url), 'utf8');
  const guard = fs.readFileSync(new URL('../js/spike-supabase-guard.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../supabase/migrations/20261118211133_spike_single_owner_admin_access.sql', import.meta.url), 'utf8');
  for (const source of [controller, guard, migration]) assert.match(source, /eletexjoeytex@gmail\.com/i);
  assert.match(controller, /profile\.role !== 'admin'/);
  assert.match(guard, /profile\.role !== 'admin'/);
  assert.match(migration, /lower\(u\.email\) = 'eletexjoeytex@gmail\.com'/i);
  assert.match(page, /html:not\(\[data-spike-auth=\"ready\"\]\).*admin-shell/s);
  assert.doesNotMatch(controller, /!\['admin',\s*'moderator'\]\.includes\(profile\.role\)/);
  assert.doesNotMatch(guard, /!\['admin','moderator'\]\.includes\(profile\.role\)/);
});
