import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../../supabase/migrations/20261109064833_spike_social_visibility_consistency_v1.sql', import.meta.url), 'utf8');

test('one private helper applies symmetric feed and message block rules', () => {
  assert.match(migration, /create or replace function private\.spike_social_pair_is_unblocked/);
  assert.match(migration, /from public\.private_message_blocks[\s\S]*?b\.blocker_id\s*=\s*p_left[\s\S]*?b\.blocker_id\s*=\s*p_right/);
  assert.match(migration, /from public\.feed_blocks[\s\S]*?b\.blocker_id\s*=\s*p_left[\s\S]*?b\.blocker_id\s*=\s*p_right/);
  assert.match(migration, /revoke all on function private\.spike_social_pair_is_unblocked\(uuid, uuid\) from public, anon, authenticated/i);
});

test('follower and following counts use the same block and privacy filters as their lists', () => {
  const counts = migration.match(/create or replace function public\.get_spike_profile_follow_counts[\s\S]*?revoke all on function public\.get_spike_profile_follow_counts/)[0];
  assert.equal((counts.match(/spike_social_pair_is_unblocked/g) || []).length >= 5, true);
  assert.match(counts, /can_view_spike_friends/);
  assert.match(counts, /can_discover_spike_profile/);
  assert.match(counts, /count\(distinct d\.document_id\)/);
  assert.match(counts, /count\(distinct f\.user_id\)/);
});

test('followers and following lists exclude blocked pairs and retain full server-side search and pagination', () => {
  const lists = migration.match(/create or replace function public\.get_spike_profile_social_list_v2[\s\S]*?revoke all on function public\.get_spike_profile_social_list_v2/)[0];
  assert.match(lists, /spike_social_pair_is_unblocked\(p_owner, v\.user_id::uuid\)/);
  assert.match(lists, /spike_social_pair_is_unblocked\(v_uid, v\.user_id::uuid\)/);
  assert.match(lists, /position\(v_search in lower\(concat_ws/);
  assert.match(lists, /limit v_limit offset v_offset/);
  assert.match(lists, /join public\.profiles follower_profile/);
});

test('mutual connections require visibility and no blocks across viewer, owner, and mutual account', () => {
  const mutuals = migration.match(/create or replace function public\.get_spike_mutual_connections[\s\S]*?revoke all on function public\.get_spike_mutual_connections/)[0];
  assert.match(mutuals, /can_view_spike_friends/);
  assert.match(mutuals, /can_discover_spike_profile\(v_uid, p_other_user_id\)/);
  assert.match(mutuals, /spike_social_pair_is_unblocked\(v_uid, p_other_user_id\)/);
  assert.match(mutuals, /spike_social_pair_is_unblocked\(v_uid, p\.id\)/);
  assert.match(mutuals, /spike_social_pair_is_unblocked\(p_other_user_id, p\.id\)/);
  assert.match(mutuals, /limit v_limit offset v_offset/);
});

test('public social RPCs remain authenticated-only', () => {
  assert.match(migration, /revoke all on function public\.get_spike_profile_follow_counts\(uuid\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.get_spike_profile_follow_counts\(uuid\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.get_spike_profile_social_list_v2\(uuid, text, integer, integer, text\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.get_spike_profile_social_list_v2\(uuid, text, integer, integer, text\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.get_spike_mutual_connections\(uuid, integer, integer, text\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.get_spike_mutual_connections\(uuid, integer, integer, text\) to authenticated/i);
});

test('profile edits serialize with follow toggles and cannot overwrite following data', () => {
  const profileMigration = readFileSync(new URL('../../../supabase/migrations/20261109065103_spike_profile_follow_write_serialization_v1.sql', import.meta.url), 'utf8');
  assert.match(profileMigration, /pg_advisory_xact_lock\(hashtextextended\(v_uid::text,\s*0\)\)/);
  assert.match(profileMigration, /p_user_doc\s*-\s*'following'/);
  assert.match(profileMigration, /v_doc\.data->'following'/);
  assert.match(profileMigration, /revoke all on function public\.spike_update_profile_v1\(jsonb,\s*jsonb,\s*jsonb\) from public, anon/i);
  assert.match(profileMigration, /grant execute on function public\.spike_update_profile_v1\(jsonb,\s*jsonb,\s*jsonb\) to authenticated/i);
});
