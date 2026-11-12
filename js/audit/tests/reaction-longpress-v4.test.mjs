import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const runtime = fs.readFileSync(path.join(root, 'js/feed-runtime-04-2.js'), 'utf8');
const feed = fs.readFileSync(path.join(root, 'feed.html'), 'utf8');

test('retired v4 reaction contract is not loaded in production', () => {
  assert.match(feed, /feed-runtime-04-2\.js\?v=reaction-v5/);
  assert.match(feed, /spike-post-actions-v4\.css\?v=reaction-v5/);
  assert.doesNotMatch(feed, /(?:feed-runtime-04-2\.js|spike-post-actions-v4\.css)\?v=reaction-v4/);
});

test('reaction selection follows the current persistent pointer path', () => {
  assert.match(runtime, /function ensureReactionTray\(\)/);
  assert.match(runtime, /tray\.addEventListener\('pointerup'/);
  assert.doesNotMatch(runtime, /document\.addEventListener\('pointerup', documentReactionBridge/);
  assert.match(runtime, /await reactToSignal\(id,emoji\)/);
});
