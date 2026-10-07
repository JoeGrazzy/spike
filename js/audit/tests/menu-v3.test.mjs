import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const feed = fs.readFileSync(path.join(ROOT, 'feed.html'), 'utf8');
const runtime = fs.readFileSync(path.join(ROOT, 'js/feed-runtime-04-3.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/spike-menu-v3.css'), 'utf8');

test('Feed uses the reference-led command panel hierarchy', () => {
  for (const id of ['menuGoLive','menuMessages','menuFriends','menuRoom','menuSaved','menuProfileHero','menuSettings','menuSafety','menuPolicy','menuSignOut']) {
    assert.match(feed, new RegExp(`id=["']${id}["']`), `missing menu control: ${id}`);
  }
  assert.match(feed, /PRIMARY HUBS/);
  assert.match(feed, /LIVE/);
  assert.match(feed, /ACCOUNT &amp; SUPPORT/);
  assert.match(feed, /menu-reference-profile/);
});

test('Menu keeps existing routes and delegated runtime actions', () => {
  const combined = `${feed}\n${runtime}`;
  for (const route of ['live.html?start=1','messages.html','friends.html','rooms.html','settings.html','policy.html','policy_appeals.html','guide.html']) {
    assert.match(combined, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(runtime, /menuOverlay\?\.addEventListener\('click', async e/);
  assert.match(runtime, /data-menu-action/);
  assert.match(runtime, /control\.dataset\.menuBusy === '1'/);
});

test('Reference menu is responsive and uses progressive disclosure for secondary tools', () => {
  assert.match(css, /max-height:min\(92dvh/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /menu-reference-support-grid/);
  assert.match(css, /menu-v3-disclosure\s+summary/);
  assert.match(css, /@media\(max-width:600px\)/);
});

test('Feed-owned creation and discovery controls stay out of the menu', () => {
  for (const id of ['menuCreate','menuDiscover','menuTrending','menuNearby','menuSignal','menuStory']) {
    assert.doesNotMatch(feed, new RegExp(`id=["']${id}["']`), `${id} should stay on Feed, not Menu`);
  }
});
