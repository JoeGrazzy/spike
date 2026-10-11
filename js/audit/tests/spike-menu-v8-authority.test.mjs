import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../../', import.meta.url);
const feed = await readFile(new URL('feed.html', root), 'utf8');
const runtime = await readFile(new URL('js/feed-runtime-04-3.js', root), 'utf8');
const css = await readFile(new URL('css/spike-android-menu-polish-v7.css', root), 'utf8');

test('V8 menu authority stylesheet is loaded after previous menu layers', () => {
  assert.match(feed, /css\/spike-feed-menu-reference-v1\.css/);
  assert.match(feed, /css\/spike-android-menu-polish-v7\.css/);
  assert.ok(feed.indexOf('css/spike-android-menu-polish-v7.css') > feed.indexOf('css/spike-feed-menu-reference-v1.css'));
});

test('V8 drawer outranks sticky header and bottom dock while open', () => {
  assert.match(css, /#menuOverlay\.spike-menu-overlay[\s\S]*?z-index:\s*95000\s*!important/);
  assert.match(css, /body:has\(#menuOverlay\.open\) #spikeBottomNav[\s\S]*?visibility:\s*hidden\s*!important/);
  assert.match(css, /pointer-events:\s*none\s*!important/);
});

test('V8 drawer keeps scroll contained and supports Android safe areas', () => {
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /env\(safe-area-inset-bottom/);
});

test('V8 preserves the existing menu open/close navigation state contract', () => {
  assert.match(runtime, /nav\.style\.setProperty\('display', hidden \? 'none' : 'grid', 'important'\)/);
  assert.match(runtime, /const openFeedMenu = \(\) => \{ openOverlay\('menuOverlay'\); setFeedMenuNavHidden\(true\); \}/);
});

test('V8 preserves existing menu destinations and sign-out flow', () => {
  for (const id of ['menuFriends', 'menuRoom', 'menuSaved', 'menuPulse', 'menuGoLive', 'menuSettings', 'menuSafety', 'menuPolicy', 'menuTheme', 'menuAudience', 'menuGuide', 'menuPolicyAppeals', 'menuSignOut']) {
    assert.match(feed, new RegExp(`id="${id}"`), `${id} remains present`);
  }
  assert.match(runtime, /const showSignOutConfirmation = \(\) =>/);
  assert.match(runtime, /db\.auth\.signOut\(\{scope:'local'\}\)/);
});
