import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const feed = fs.readFileSync(path.join(ROOT, 'feed.html'), 'utf8');
const runtime = fs.readFileSync(path.join(ROOT, 'js/feed-runtime-04-3.js'), 'utf8');

test('Feed architecture V1 keeps primary navigation to Home, Discover, Start, Messages and Me', () => {
  for (const key of ['home','discover','create','messages','profile']) {
    assert.match(feed, new RegExp(`data-spike-nav=["']${key}["']`));
  }
  assert.doesNotMatch(feed, /data-spike-nav=["']activity["']/);
});

test('Feed architecture V1 removes Feed-owned discovery filters from the primary Feed', () => {
  assert.match(feed, /data-filter=["']forYou["'][^>]*>For You</);
  assert.match(feed, /data-filter=["']following["'][^>]*>Following</);
  for (const filter of ['popular','trending','saved']) {
    assert.doesNotMatch(feed, new RegExp(`data-filter=["']${filter}["']`));
  }
});

test('Feed architecture V1 moves discovery into a dedicated Discover mode without deleting runtime panels', () => {
  assert.match(feed, /id=["']feedV2Hub["']/);
  assert.match(feed, /id=["']spikeDiscoverClose["']/);
  for (const tab of ['discover','moments','trending','reels','nearby']) {
    assert.match(feed, new RegExp(`data-v2=["']${tab}["']`));
  }
  for (const tab of ['analytics','gamify','creator','safety']) {
    assert.doesNotMatch(feed, new RegExp(`data-v2=["']${tab}["']`));
  }
  assert.match(runtime, /spike-discover-mode/);
});

test('Feed architecture V1 keeps creation contextual and preserves native global routes', () => {
  assert.match(feed, /id=["']spikeComposer["']/);
  assert.match(feed, /data-spike-nav=["']create["']/);
  assert.match(feed, /href=["']messages\.html["'][^>]*data-spike-nav=["']messages["']/);
  assert.match(feed, /href=["']profile\.html["'][^>]*data-spike-nav=["']profile["']/);
});
