import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../../spike-social-connections.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../supabase/migrations/20261108153000_spike_social_relationship_consistency_v6.sql', import.meta.url), 'utf8');
const socialService = readFileSync(new URL('../../spike-social.js', import.meta.url), 'utf8');

test('legacy following entries without a profile can be removed from the owner Following list', () => {
  assert.match(runtime, /canRemoveMissingFollow = missing && state\.ownerIsMe && kind === 'following'/);
  assert.match(runtime, /canRemoveMissingFollow \? 'Remove'/);
  assert.match(runtime, /window\.SPIKE\.social\.setFollow/);
  assert.match(socialService, /spike_set_follow_v1/);
});

test('a follow-state read failure does not prevent the authorized social list from loading', () => {
  assert.match(runtime, /try \{\s*await loadMyFollowing\(\);\s*\} catch/);
  assert.match(runtime, /state\.followingLoaded = false/);
});

test('blocking refreshes counts and synchronizes the local follow state', () => {
  assert.match(runtime, /state\.followingIds\.delete\(id\)/);
  assert.match(runtime, /refreshConnectionCount\(\)\.catch/);
  assert.match(runtime, /action: 'follow', active: false/);
});

test('follow mutation safely normalizes canonical legacy user documents with null owner_id', () => {
  assert.match(migration, /d\.owner_id is null/);
  assert.match(migration, /v_row\.owner_id is not null and v_row\.owner_id <> v_uid/);
  assert.match(migration, /owner_id = coalesce\(owner_id, v_uid\)/);
});

test('blocking cleans both follow directions and cancels pending friend requests', () => {
  assert.match(migration, /delete from public\.friendships/);
  assert.match(migration, /Remove both directions of Follow/);
  assert.match(migration, /delete from public\.friend_requests[\s\S]*?status = 'pending'/);
  assert.match(migration, /delete from public\.notifications n[\s\S]*?n\.data->>'request_id'/);
});

test('friend request inbox excludes relationships blocked in either direction', () => {
  assert.match(migration, /create or replace function public\.get_friend_requests\(\)/);
  assert.match(migration, /not exists \([\s\S]*?public\.private_message_blocks b[\s\S]*?b\.blocker_id = fr\.sender_id[\s\S]*?b\.blocker_id = fr\.recipient_id/);
});


test('follow counts include the same valid UUID references rendered as removable stale rows', () => {
  assert.match(migration, /Counts use the same identity and visibility rules as the list RPC/);
  assert.match(migration, /where f\.user_id ~\* '\^\[0-9a-f\]/);
  assert.doesNotMatch(migration, /exists\(select 1 from public\.app_documents d where d\.collection_name = 'users'[\s\S]*?or p\.id is not null/);
});
