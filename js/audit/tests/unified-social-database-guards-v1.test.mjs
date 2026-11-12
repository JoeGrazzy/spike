import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../../supabase/migrations/20261109064041_protect_follow_state_during_profile_edits_and_relationship_reads.sql', import.meta.url), 'utf8');

test('profile updates preserve server-managed following relationships', () => {
  assert.match(migration, /p_user_doc\s*-\s*'following'/);
  assert.match(migration, /jsonb_set\(v_data,'\{following\}'[\s\S]*v_doc\.data->'following'/);
});

test('viewer relationship reads normalize legacy string and object IDs', () => {
  assert.match(migration, /jsonb_typeof\(e\.value\)='string'/);
  assert.match(migration, /jsonb_typeof\(e\.value\)='object'[\s\S]*e\.value->>'id'[\s\S]*e\.value->>'user_id'/);
});

test('viewer relationship state respects both block stores and discoverability', () => {
  assert.match(migration, /can_discover_spike_profile\(me\.uid,p_other_user\)/);
  assert.match(migration, /from public\.private_message_blocks/);
  assert.match(migration, /from public\.feed_blocks/);
});
