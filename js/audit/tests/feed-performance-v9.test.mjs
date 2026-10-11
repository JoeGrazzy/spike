import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../../', import.meta.url);
const menuCss = await readFile(new URL('css/spike-android-menu-polish-v7.css', root), 'utf8');
const runtime = await readFile(new URL('js/feed-runtime-04-3.js', root), 'utf8');
const adaptiveNav = await readFile(new URL('js/spike-adaptive-nav.js', root), 'utf8');
const html = await readFile(new URL('feed.html', root), 'utf8');

test('Feed menu state has a CSS fallback that hides and disables the fixed bottom navigation', () => {
  assert.match(runtime, /document\.body\.classList\.toggle\('spike-feed-menu-open', !!hidden\)/);
  assert.match(menuCss, /body\.spike-feed-menu-open #spikeBottomNav[\s\S]*?visibility:\s*hidden\s*!important/);
  assert.match(menuCss, /body\.spike-feed-menu-open #spikeBottomNav[\s\S]*?pointer-events:\s*none\s*!important/);
});

test('Android menu rendering avoids expensive full-screen backdrop blur', () => {
  assert.match(menuCss, /#menuOverlay\.spike-menu-overlay\s*\{[\s\S]*?-webkit-backdrop-filter:\s*none\s*!important/);
  assert.match(menuCss, /\.spike-bottom-nav\s*\{\s*-webkit-backdrop-filter:\s*none\s*!important/);
});

test('V9 preserves protected Feed source and current navigation/action contracts', () => {
  assert.match(html, /id="spikeBottomNav"/);
  assert.match(html, /id="menuOverlay"/);
  assert.match(runtime, /const openFeedMenu = \(\) => \{ openOverlay\('menuOverlay'\); setFeedMenuNavHidden\(true\); \}/);
  assert.doesNotMatch(adaptiveNav, /bodyObserver\s*=\s*new MutationObserver\(sync\)/, 'adaptive navigation must not observe every Feed DOM mutation');
  assert.match(adaptiveNav, /const menuOpen=!!window\.__SPIKE_FEED_MENU_OPEN__ \|\| !!document\.querySelector\('#menuOverlay\.open, #menuOverlay\[aria-hidden=\"false\"\]'\)/);
  assert.match(adaptiveNav, /const menuOwnsNav=menuOpen/);
});
