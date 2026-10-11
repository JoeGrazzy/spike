import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const world = await readFile('supabase/migrations/20260906163000_leveling_v3_world_reward_race_hardening.sql', 'utf8');
const missionJoin = await readFile('supabase/migrations/20260906163500_mission_join_concurrency_hardening.sql', 'utf8');
const feed = await readFile('feed.html', 'utf8');

test('SPIKE World reward hardening is server-authoritative and race-safe', () => {
  assert.match(world, /security definer/i);
  assert.match(world, /mission_progress/);
  assert.match(world, /pg_advisory_xact_lock/);
  assert.match(world, /100-today_points/);
  assert.match(world, /Only the signed-in user can earn points/);
});

test('Community Mission capacity is serialized before counting members', () => {
  assert.match(missionJoin, /from public\.spike_community_missions[\s\S]*for update/i);
  assert.match(missionJoin, /count\(\*\).*spike_community_mission_members/i);
  assert.match(missionJoin, /Mission is full/);
});

test('Feed loads the split feature stylesheet after feed core', () => {
  const core = feed.indexOf('css/feed-core.css');
  const features = feed.indexOf('css/feed-features.css');
  assert.ok(core >= 0 && features > core);
});
