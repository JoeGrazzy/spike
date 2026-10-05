import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('../../..', import.meta.url).pathname);
const feed = fs.readFileSync(path.join(root,'feed.html'),'utf8');
const ux = fs.readFileSync(path.join(root,'js/spike-experience-v2.js'),'utf8');
const guide = fs.readFileSync(path.join(root,'js/spike-guide-experience-v2.js'),'utf8');

test('Experience V2 is additive and loaded after existing Feed runtime', () => {
  assert.match(feed,/css\/spike-experience-v2\.css/);
  assert.match(feed,/js\/spike-experience-v2\.js/);
  assert.ok(feed.indexOf('js/feed-runtime-11.js') < feed.indexOf('js/spike-experience-v2.js'));
  assert.ok(feed.indexOf('js/spike-native-v2.js') < feed.indexOf('js/spike-experience-v2.js'));
});

test('Experience V2 never installs a global MutationObserver or replaces boot', () => {
  assert.doesNotMatch(ux,/new\s+MutationObserver/);
  assert.doesNotMatch(ux,/\bboot\s*=\s*async/);
  assert.doesNotMatch(ux,/__SPIKE_FEED_STARTUP_WATCHDOG__/);
});

test('Composer keeps stable core IDs and uses progressive disclosure', () => {
  for (const id of ['signalText','imageBtn','videoBtn','linkBtn','scheduleBtn','storyBtn','composeAiBtn','saveDraftBtn','contentCenterBtn','releaseSignalBtn']) {
    assert.match(feed,new RegExp(`id=["']${id}["']`));
  }
  assert.match(ux,/spike-x-more-row/);
  assert.match(ux,/spikeXAdvanced/);
});

test('Guide uses the same simple five-part mental model', () => {
  assert.match(guide,/HOME/); assert.match(guide,/DISCOVER/); assert.match(guide,/CREATE/); assert.match(guide,/CONNECT/); assert.match(guide,/YOU/);
  assert.match(guide,/Signal/); assert.match(guide,/Momentum/); assert.match(guide,/Signal Vault/);
});
