import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const intelligence = await readFile('spike_intelligence.html','utf8');
const coffee = await readFile('coffee.html','utf8');
const feedRuntime = await readFile('js/feed-runtime-04-3.js','utf8');
const feed = await readFile('feed.html','utf8');
const intelligenceJs = await readFile('js/spike-intelligence-suite.js','utf8');

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

test('production UI contains no known placeholder or fake-feature messaging', () => {
  for (const pattern of forbidden) {
    assert.doesNotMatch(intelligence + coffee + feedRuntime + feed, pattern, String(pattern));
  }
});

test('profile reporting uses the real abuse-case persistence boundary', () => {
  assert.match(feedRuntime, /db\.from\('spike_abuse_cases'\)\.insert/);
  assert.match(feedRuntime, /subject_user_id:id/);
  assert.match(feedRuntime, /source:'profile'/);
  assert.match(feedRuntime, /category:'user_report'/);
  assert.doesNotMatch(feedRuntime, /User reporting is not available/);
});

test('Founder route is informational rather than an unconnected payment checkout', () => {
  assert.match(coffee, /Founder &amp; Creator/);
  assert.doesNotMatch(coffee, /Support checkout|payment provider|custom amount|data-amount=/i);
});

test('Intelligence page exposes only implemented connected surfaces', () => {
  assert.doesNotMatch(intelligence, /Collaboration.*next connected|future personalized/i);
  assert.match(intelligenceJs, /get_spike_intelligence_snapshot_v1/);
  assert.match(intelligenceJs, /memorySave/);
});
