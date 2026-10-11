import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../../../dating.html', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../supabase/migrations/20261011193000_spike_dating_safety_and_matches_v1.sql', import.meta.url), 'utf8');
const setup = readFileSync(new URL('../../../SPIKE_DATING_SETUP.sql', import.meta.url), 'utf8');

test('Dating profile save prevents duplicate submits and preserves error state', () => {
  assert.match(page, /let savingProfile=false/);
  assert.match(page, /if\(savingProfile\)return/);
  assert.match(page, /Could not save your profile: .*Your entries are still here/);
  assert.match(page, /Your dating profile has been saved/);
});

test('Dating discovery uses privacy-preserving RPC, not direct discovery view access', () => {
  assert.match(page, /db\.rpc\('get_dating_discover_profiles'\)/);
  assert.doesNotMatch(page, /from\('dating_discover_profiles'\)/);
  assert.match(migration, /returns table\(user_id uuid, age integer/);
  assert.match(migration, /revoke all on function public\.get_dating_discover_profiles\(\) from public, anon/i);
  assert.match(migration, /drop view if exists public\.dating_discover_profiles/i);
});

test('Dating schema defines protected blocks, reports, unique matches and mutual-like trigger', () => {
  for (const table of ['dating_blocks','dating_reports','dating_matches']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /unique\(user_low,user_high\)/i);
  assert.match(migration, /after insert on public\.dating_likes/i);
  assert.match(setup, /get_dating_discover_profiles/);
});
