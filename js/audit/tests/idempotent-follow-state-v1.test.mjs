import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../../supabase/migrations/20261109065451_spike_idempotent_follow_state_mutation_v1.sql', import.meta.url), 'utf8');
const guardMigration = readFileSync(new URL('../../../supabase/migrations/20261109065726_spike_follow_setter_visibility_noop_guard_v1.sql', import.meta.url), 'utf8');
const lockMigration = readFileSync(new URL('../../../supabase/migrations/20261109065811_spike_follow_block_pair_serialization_v1.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('../../spike-social.js', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../../profile-page.js', import.meta.url), 'utf8');
const viewUser = readFileSync(new URL('../../../view_user.html', import.meta.url), 'utf8');
const feed = readFileSync(new URL('../../feed-runtime-04-3.js', import.meta.url), 'utf8');
const lists = readFileSync(new URL('../../spike-social-connections.js', import.meta.url), 'utf8');

test('database exposes an idempotent desired-state follow setter', () => {
  assert.match(migration, /create or replace function public\.spike_set_follow_v1\(p_target_user_id uuid, p_following boolean\)/);
  assert.match(migration, /if p_following and not v_is_following then/);
  assert.match(migration, /elsif not p_following and v_is_following then/);
  assert.match(migration, /return jsonb_build_object\('following',p_following,'changed',false\)/);
  assert.match(migration, /return jsonb_build_object\('following',p_following,'changed',true\)/);
});

test('legacy toggle RPC delegates to the canonical desired-state setter', () => {
  assert.match(migration, /create or replace function public\.spike_toggle_follow_v1/);
  assert.match(migration, /return public\.spike_set_follow_v1\(p_target_user_id,not v_is_following\)/);
});

test('the shared service calls only the idempotent setter for mutations', () => {
  assert.match(service, /rpc\('spike_set_follow_v1'/);
  assert.match(service, /p_following: following/);
  assert.match(service, /typeof result\.data\?\.changed !== 'boolean'/);
  assert.doesNotMatch(service, /rpc\('spike_toggle_follow_v1'/);
});

test('all follow buttons send an explicit desired state and Feed popup prevents double clicks', () => {
  assert.match(profile, /social\.setFollow\(db,state\.uid,!state\.following\)/);
  assert.match(viewUser, /social\.setFollow\(db,state\.uid,!state\.following\)/);
  assert.match(lists, /social\.setFollow\(state\.db, id, !wasFollowing\)/);
  assert.match(feed, /social\.setFollow\(db,id,desiredFollowing\)/);
  assert.match(feed, /if\(btn\?\.disabled\)return/);
  assert.match(feed, /btn\.disabled=true/);
});


test('idempotent follow repeats still enforce current visibility and block rules', () => {
  assert.match(guardMigration, /if p_following then[\s\S]*?can_discover_spike_profile/);
  assert.match(guardMigration, /spike_social_pair_is_unblocked/);
  assert.match(guardMigration, /return jsonb_build_object\('following',p_following,'changed',false\)/);
});

test('follow mutations and feed block/unblock take the same deterministic pair locks', () => {
  assert.match(lockMigration, /least\(v_uid::text,p_target_user_id::text\)/);
  assert.match(lockMigration, /greatest\(v_uid::text,p_target_user_id::text\)/);
  assert.match(lockMigration, /create or replace function private\.spike_lock_feed_block_pair/);
  assert.match(lockMigration, /before insert or delete on public\.feed_blocks/);
  assert.match(lockMigration, /pg_advisory_xact_lock\(hashtextextended\(v_first::text,0\)\)/);
  assert.match(lockMigration, /pg_advisory_xact_lock\(hashtextextended\(v_second::text,0\)\)/);
});
