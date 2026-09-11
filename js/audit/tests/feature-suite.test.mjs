import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const feed = await readFile('feed.html', 'utf8');
const js = await readFile('js/spike-feature-suite.js', 'utf8');
const css = await readFile('css/spike-feature-suite.css', 'utf8');
const migration = await readFile('supabase/migrations/20260911090000_spike_feature_suite_v1.sql', 'utf8');

test('feature suite assets are present exactly once', () => {
  assert.equal((feed.match(/js\/spike-feature-suite\.js/g) || []).length, 1);
  assert.equal((feed.match(/css\/spike-feature-suite\.css/g) || []).length, 1);
  assert.equal((feed.match(/id="spikePulseBtn"/g) || []).length, 1);
  assert.equal((feed.match(/id="spikeFeatureHub"/g) || []).length, 1);
});

test('all ten feature surfaces exist', () => {
  for (const name of ['feeds','polls','series','collab','creator','search','reputation','resume','dashboard']) {
    assert.match(feed, new RegExp(`data-feature-panel="${name}"`));
  }
  assert.match(feed, /SPIKE Feature Center/);
  assert.match(js, /Custom Feed created/);
  assert.match(js, /Poll created/);
  assert.match(js, /Signal Series created/);
  assert.match(js, /Collaboration invite created/);
  assert.match(js, /Membership tier created/);
  assert.match(js, /Creator product created/);
  assert.match(js, /spike_my_reputation/);
});

test('feature suite uses unique storage key and does not replace existing header controls', () => {
  assert.match(js, /spike-feature-suite-v1/);
  assert.match(feed, /id="spikeCoffeeBtn"/);
  assert.match(feed, /id="spikeAiSearchBtn"/);
  assert.match(feed, /id="spikeThemeIcon"/);
  assert.match(feed, /id="menuBtn"/);
});

test('feature suite contains no flash/lightning emoji', () => {
  assert.doesNotMatch(feed + js + css, /⚡/);
});

test('feature migration contains the required tables and protected RPCs', () => {
  for (const table of ['spike_custom_feeds','spike_polls','spike_poll_options','spike_poll_votes','spike_signal_series','spike_series_items','spike_signal_collaborators','spike_creator_memberships','spike_membership_members','spike_creator_products','spike_reputation_events','spike_resume_states']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(migration, /create or replace function public\.spike_cast_poll_vote/);
  assert.match(migration, /create or replace function public\.spike_my_reputation/);
  assert.match(migration, /enable row level security/);
});
