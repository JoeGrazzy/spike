import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260905123000_harden_rpc_execution_and_search_path_v17.sql'), 'utf8');

test('Supabase hardening pins leveling RPC search_path', () => {
  assert.match(migration, /alter function public\.get_spike_leveling_profile\(\) set search_path\s*=\s*public/i);
});

test('Supabase trigger RPC is not executable by API roles', () => {
  assert.match(migration, /revoke all on function public\.sync_friend_request_notification\(\) from public, anon, authenticated/i);
});
