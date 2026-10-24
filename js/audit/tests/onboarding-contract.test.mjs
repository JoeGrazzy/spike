import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const onboarding = read('js/spike-onboarding-v1.js');
const migration = read('supabase/migrations/20261023100000_spike_optional_onboarding_v1.sql');
const css = read('css/spike-onboarding-v1.css');

test('optional onboarding has explicit Start Tutorial and Skip for Now paths', () => {
  assert.match(onboarding, /Start Tutorial/);
  assert.match(onboarding, /Skip for Now/);
  assert.match(onboarding, /async function skipTutorial/);
  assert.match(onboarding, /status: 'skipped'/);
});

test('onboarding is optional and never blocks authentication or core navigation', () => {
  assert.match(onboarding, /Tutorial failures must never block or interrupt the main SPIKE app/);
  assert.match(onboarding, /status: 'in_progress'/);
  assert.match(onboarding, /function closeTutorial/);
  assert.doesNotMatch(onboarding, /window\.location\.replace\(['"]index\.html/);
});

test('tutorial covers the core social and safety destinations', () => {
  for (const destination of ['feed.html','friends.html','messages.html','rooms.html','notifications.html','settings.html']) {
    assert.ok(onboarding.includes(`page:'${destination}'`), `missing tutorial destination ${destination}`);
  }
  assert.match(onboarding, /const LESSONS = \[/);
});

test('progress persistence is per user with a local fallback', () => {
  assert.match(onboarding, /spike_onboarding_progress/);
  assert.match(onboarding, /localStorage/);
  assert.match(onboarding, /user_id: user\.id/);
  assert.match(onboarding, /onConflict: 'user_id'/);
});

test('Supabase onboarding migration limits row access to the authenticated owner', () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /grant select, insert, update .* to authenticated/i);
  assert.match(migration, /revoke all .* from anon, public/i);
});

test('onboarding UI inherits theme tokens and respects reduced motion', () => {
  assert.match(css, /var\(--spike-action-bg/);
  assert.match(css, /var\(--spike-line/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /focus-visible/);
});

test('all main authenticated pages load the optional onboarding module', () => {
  const pages = ['feed.html','friends.html','profile.html','messages.html','message.html','rooms.html','room.html','room_chat.html','notifications.html','settings.html','help.html','guide.html','view_user.html','live.html'];
  for (const page of pages) {
    assert.ok(existsSync(new URL(`../../../${page}`, import.meta.url)), `missing ${page}`);
    assert.match(read(page), /js\/spike-onboarding-v1\.js\?v=2/, `${page} does not load onboarding`);
  }
});

test('onboarding inherits the canonical five-theme registry', () => {
  const themes = read('js/theme.js');
  for (const name of ['Midnight Luxe','Arctic Glass','Emerald Obsidian','Sandstone Studio','Cosmic Pulse']) assert.ok(themes.includes(name), `missing theme ${name}`);
  assert.match(css, /var\(--spike-accent/);
});
