import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../../', import.meta.url);
const menuCss = await readFile(new URL('css/spike-feed-menu-reference-v1.css', root), 'utf8');
const runtime = await readFile(new URL('js/feed-runtime-04-3.js', root), 'utf8');
const html = await readFile(new URL('feed.html', root), 'utf8');
const adaptive = await readFile(new URL('js/spike-adaptive-nav.js', root), 'utf8');

test('Feed bottom navigation is hidden only while the menu is actively open', () => {
  assert.match(menuCss, /body:has\(#menuOverlay\.open\) #spikeBottomNav/);
  assert.match(menuCss, /body:has\(#menuOverlay\.open\) \.spike-bottom-nav/);
  assert.match(menuCss, /display:none\s*!important/);
  assert.match(menuCss, /pointer-events:none\s*!important/);
});

test('Feed menu has an authoritative runtime hide/show path that beats the inline nav baseline', () => {
  assert.match(runtime, /function setFeedMenuNavHidden\(hidden\)/);
  assert.match(runtime, /nav\.style\.setProperty\('display', hidden \? 'none' : 'grid', 'important'\)/);
  assert.match(runtime, /nav\.style\.setProperty\('visibility', hidden \? 'hidden' : 'visible', 'important'\)/);
  assert.match(runtime, /const openFeedMenu = \(\) => \{ openOverlay\('menuOverlay'\); setFeedMenuNavHidden\(true\); \}/);
  assert.match(runtime, /window\.__SPIKE_FEED_MENU_OPEN__ = !!hidden/);
  assert.match(runtime, /nav\.dataset\.spikeNavState = hidden \? 'hidden' : 'visible'/);
  assert.match(runtime, /const closeFeedMenu = \(\) => \{ closeOverlay\('menuOverlay'\); setFeedMenuNavHidden\(false\)/);
  assert.equal((runtime.match(/closeOverlay\('menuOverlay'\)/g) || []).length, 1, 'all menu closes must use the centralized close path');
  assert.equal((runtime.match(/openOverlay\('menuOverlay'\)/g) || []).length, 1, 'menu open must use the centralized open path');
  assert.match(html, /id="spikeBottomNav"/);

  assert.match(adaptive, /window\.__SPIKE_FEED_MENU_OPEN__/);
  assert.match(adaptive, /const menuOpen=!!window\.__SPIKE_FEED_MENU_OPEN__/);
});
