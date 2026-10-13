import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const themeJs = await readFile('js/theme.js', 'utf8');
const feed = await readFile('feed.html', 'utf8');
const settings = await readFile('settings.html', 'utf8');

test('Global theme persistence is shared by Feed and Settings', () => {
  assert.match(themeJs, /localStorage\.setItem\(KEY,String\(id\)\)/);
  assert.match(themeJs, /window\.addEventListener\('storage'/);
  assert.match(themeJs, /e\.key===KEY/);
  assert.match(themeJs, /hasStored:/); assert.match(themeJs, /const KEY='spike-theme-choice-v3'/);
  assert.match(settings, /localStorage\.getItem\('spike-theme-choice-v3'\)/);
  assert.match(settings, /window\.SPIKE_THEME\.set\(n\)/);
  assert.match(settings, /spike:theme-change/);
});

test('Feed has one authoritative theme-pill click runtime', () => {
  assert.equal((feed.match(/id="spikeThemeIcon"/g) || []).length, 1);
  assert.equal((feed.match(/spikeThemeHardened/g) || []).length, 0);
  assert.doesNotMatch(feed, /btn\.addEventListener\('click',function\(\)/);
});
