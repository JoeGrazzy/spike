import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';

const root = process.cwd();
const feed = await readFile(path.join(root, 'feed.html'), 'utf8');

async function exists(p) {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

test('Dedicated Live page and runtime files are removed', async () => {
  assert.equal(await exists(path.join(root, 'live.html')), false, 'live.html should be removed');
  assert.equal(await exists(path.join(root, 'js/spike-live.js')), false, 'js/spike-live.js should be removed');
  assert.equal(await exists(path.join(root, 'js/spike-feed-live.js')), false, 'js/spike-feed-live.js should be removed');
  assert.equal(await exists(path.join(root, 'css/spike-live.css')), false, 'css/spike-live.css should be removed');
});

test('Feed does not contain Live feature rail or entry points', () => {
  assert.doesNotMatch(feed, /spikeFeedLive|live\.html|spike-feed-live\.js|Start Live|See all Live|Live on SPIKE|menu-go-live/i);
});

test('Live create migrations are archived (not active)', async () => {
  const active = await readdir(path.join(root, 'supabase', 'migrations'));
  const liveCreate = active.filter(name => /spike_live_(audience|complete|phase|social|moderation|viewer)/i.test(name));
  assert.equal(liveCreate.length, 0, 'Live create migrations must not remain in active migrations folder');

  const archived = await readdir(path.join(root, 'supabase', 'migrations-archive', 'live-stream-removed'));
  assert.ok(archived.some(n => /spike_live_/i.test(n)), 'expected Live migrations to be present in the archive');
});
