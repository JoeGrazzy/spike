import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const feed = await readFile(path.join(root, 'feed.html'), 'utf8');
const removedPaths = ['live.html','js/spike-live.js','js/spike-feed-live.js','css/spike-live.css','js/audit/tests/feed-live-rail-stability.test.mjs'];

test('dedicated live-stream page and runtime assets are removed', async () => {
  for (const rel of removedPaths) assert.equal(existsSync(path.join(root, rel)), false, `${rel} should be removed`);
});

test('Feed has no live-stream UI or asset references', () => {
  assert.doesNotMatch(feed, /spikeFeedLive|spike-feed-live|live\.html|spike-feed-live\.js|Start Live|See all Live|Live on SPIKE/i);
});

test('active HTML, CSS, and JavaScript contain no live-stream entry points', async () => {
  const files = [];
  async function walk(dir) { for (const entry of await readdir(dir, {withFileTypes:true})) { const full=path.join(dir,entry.name); if(entry.isDirectory()) { if(['supabase','docs'].includes(entry.name)) continue; await walk(full); } else if(/\.(html|css|js|mjs)$/.test(entry.name) && !full.includes(path.join('js','audit','tests')) && !full.endsWith(path.join('js','audit','static-audit.mjs'))) files.push(full); } }
  await walk(root);
  const matches=[];
  for(const file of files){ const source=await readFile(file,'utf8'); if(/spikeFeedLive|spike-feed-live|spike-live\.js|spike-live\.css|live\.html|menuGoLive|menu-reference-live|menu-v3-live|spike_live_streams/i.test(source)) matches.push(path.relative(root,file)); }
  assert.deepEqual(matches, [], `Remaining active live-stream references: ${matches.join(', ')}`);
});


test('active Supabase migrations cannot recreate the removed streaming feature', async () => {
  const active = await readdir(path.join(root, 'supabase', 'migrations'));
  assert.deepEqual(active.filter(name => /spike_live_|live_stream/i.test(name)), [], 'streaming migrations must live only in the archive');
});
