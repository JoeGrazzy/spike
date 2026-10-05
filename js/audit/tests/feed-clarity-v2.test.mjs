import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const feed = fs.readFileSync(path.join(ROOT, 'feed.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/feed-clarity-v2.css'), 'utf8');
const native = fs.readFileSync(path.join(ROOT, 'js/spike-native-v2.js'), 'utf8');
const experience = fs.readFileSync(path.join(ROOT, 'js/spike-experience-v2.js'), 'utf8');

function between(a,b){
  const i=feed.indexOf(a), j=feed.indexOf(b,i+1);
  return i>=0&&j>=0?feed.slice(i,j):'';
}

test('Home keeps For You/Following before the composer', () => {
  assert.ok(feed.indexOf('id="filters"') < feed.indexOf('id="spikeComposer"'));
});

test('Top Picks belongs to Discover, not the Home stream', () => {
  const hub=between('id="feedV2Hub"','id="filters"');
  assert.match(hub,/id="signalTopPicks"/);
  assert.match(css,/main\.spike-x-home:not\(\.spike-discover-mode\) #signalTopPicks\{display:none!important\}/);
});

test('Discover mode hides Home content and reveals the Discover hub', () => {
  assert.match(css,/main\.spike-x-home:not\(\.spike-discover-mode\) #feedV2Hub\{display:none!important\}/);
  assert.match(css,/main\.spike-x-home\.spike-discover-mode #feedV2Hub\{display:block!important/);
  assert.match(css,/main\.spike-x-home\.spike-discover-mode #posts/);
});

test('Native Social tools are progressive disclosure inside Discover', () => {
  assert.match(native,/id='spikeNativeDisclosure'/);
  assert.match(native,/<summary>More discovery tools<\/summary>/);
  assert.match(native,/disclosure\.appendChild\(panel\)/);
  assert.match(native,/hub\.appendChild\(disclosure\)/);
  assert.match(native,/function ensureNativeNavButton\(\) \{ \/\* Native tools are progressive disclosure inside Discover\. \*\//);
  assert.match(css,/#spikeNativeDisclosure\>summary/);
});

test('Feed status ranking jargon is hidden from the primary Home surface', () => {
  assert.match(css,/main\.spike-x-home \.feed-status\{display:none!important\}/);
});

test('Composer advanced disclosure has a valid controlled element', () => {
  assert.match(experience,/const advanced = row;/);
  assert.match(experience,/advanced\.id = 'spikeXAdvanced'/);
  assert.match(experience,/toggle\.setAttribute\('aria-controls', 'spikeXAdvanced'\)/);
});

test('Primary Feed vocabulary stays plain instead of being globally rewritten', () => {
  assert.match(native,/following:'Following'/);
  assert.match(native,/storyBtn\) storyBtn\.textContent='◎ Story'/);
  assert.doesNotMatch(native,/following:'Connections'/);
  assert.doesNotMatch(native,/storyBtn\) storyBtn\.textContent='◌ Pulse'/);
});
