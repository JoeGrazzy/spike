import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const feed = await readFile(path.join(root, 'feed.html'), 'utf8');

test('Live remains available as a dedicated SPIKE feature page', async () => {
  const html = await readFile(path.join(root, 'live.html'), 'utf8');
  assert.match(html, /css\/spike-live\.css/);
  assert.match(html, /js\/spike-live\.js/);
});

test('Feed does not duplicate the dedicated Live feature rail', () => {
  assert.doesNotMatch(feed, /spikeFeedLive|spike-feed-live|live\.html|spike-feed-live\.js|Start Live|See all Live|Live on SPIKE/i);
});

test('Live feature entry points remain page-scoped to the dedicated Live page', async () => {
  const [liveCss, liveJs] = await Promise.all([
    readFile(path.join(root, 'css/spike-live.css'), 'utf8'),
    readFile(path.join(root, 'js/spike-live.js'), 'utf8')
  ]);
  assert.ok(liveCss.length > 0, 'Live page stylesheet should not be empty');
  assert.ok(liveJs.length > 0, 'Live page runtime should not be empty');
  assert.match(liveJs, /spike_live_streams|live/i);
});

test('Live database migrations remain available for the retained Live feature', async () => {
  const active = await readdir(path.join(root, 'supabase', 'migrations'));
  assert.ok(active.some(name => /spike_live_|live_stream/i.test(name)), 'expected Live feature migrations to remain active');
});
