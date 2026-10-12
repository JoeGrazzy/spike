import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('profile no longer contains level badge styling', () => {
  const profile = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');
  assert.doesNotMatch(profile, /spike-level-badge-profile|level-badge-mini|level-progress-wrap/);
});

test('guide no longer promotes leveling, XP or daily check-in progression', () => {
  const guide = fs.readFileSync(path.join(root, 'guide.html'), 'utf8');
  assert.doesNotMatch(guide, /Daily Check-in|Track XP, levels|Leveling is for progress|collect XP|healthy streak/i);
});

test('legacy level badge assets are retained for future use', () => {
  const dir = path.join(root, 'assets', 'badges');
  assert.ok(fs.existsSync(dir), 'Reusable badge asset directory must be retained');
  assert.ok(fs.readdirSync(dir).some(name => /level/i.test(name)), 'Expected future-use level badge artwork');
});

test('forward database cleanup migration exists and preserves wallet tables', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261012120000_remove_leveling_system_permanently.sql'), 'utf8');
  assert.match(migration, /DROP TABLE IF EXISTS public\.user_streaks/i);
  assert.match(migration, /DROP TABLE IF EXISTS public\.spike_community_missions/i);
  assert.doesNotMatch(migration, /DROP TABLE IF EXISTS public\.(wallets|coin_transactions|profiles)/i);
});
