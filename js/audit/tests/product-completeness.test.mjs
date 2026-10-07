import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const feed = await readFile('feed.html','utf8');
const feedRuntime = await readFile('js/feed-runtime-04-3.js','utf8');

const retiredPages = [
  'bridge-harness.html','theme-browser-test.html','index-probe.html','index-static.html',
  'coffee.html','engagement.html','leveling.html','spike_edu.html','spike_intelligence.html',
  'spike_predictor.html','spike_world.html','chat_room.html'
];

const forbidden = [
  /workspace is ready for the next connected creation flow/i,
  /future personalized SPIKE home/i,
  /not available in the current Supabase schema/i,
  /payment processing is intentionally separated from this UI/i,
  /connect it to your verified payment provider/i,
  /coming soon/i,
  /not implemented/i,
  /dummy data/i,
  /mock data/i,
  /sample data/i
];

test('simplification contract removes obsolete destinations', async () => {
  for (const page of retiredPages) {
    await assert.rejects(() => readFile(page, 'utf8'), /ENOENT/, `${page} should be retired`);
  }
});

test('Feed no longer exposes retired destinations', () => {
  for (const page of retiredPages) assert.doesNotMatch(feed, new RegExp(page.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(feedRuntime, /coffee\.html|engagement\.html/);
});

test('production UI contains no known placeholder or fake-feature messaging', () => {
  for (const pattern of forbidden) assert.doesNotMatch(feedRuntime + feed, pattern, String(pattern));
});

test('profile reporting uses the real abuse-case persistence boundary', () => {
  assert.match(feedRuntime, /db\.from\('spike_abuse_cases'\)\.insert/);
  assert.match(feedRuntime, /subject_user_id:id/);
  assert.match(feedRuntime, /source:'profile'/);
  assert.match(feedRuntime, /category:'user_report'/);
  assert.doesNotMatch(feedRuntime, /User reporting is not available/);
});
