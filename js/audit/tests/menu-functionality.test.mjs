import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const feed = fs.readFileSync(path.join(ROOT, 'feed.html'), 'utf8');
const runtime = fs.readFileSync(path.join(ROOT, 'js/feed-runtime-04-3.js'), 'utf8');

const runtimeActions = {
  menuSaved:'saved', menuAudience:'audience', menuSafety:'safety', menuSignOut:'signout'
};
const nativeRoutes = {
  menuProfileHero:'profile.html', menuProfile:'profile.html', menuMessages:'messages.html', menuFriends:'friends.html',
  menuRoom:'rooms.html', menuProgress:'leveling.html', menuWorld:'spike_world.html', menuGuide:'guide.html', menuSettings:'settings.html',
  menuGoLive:'live.html?start=1', menuNotifications:'notifications.html', menuSbet:'spike_predictor.html',
  menuIntelligence:'spike_intelligence.html', menuPolicy:'policy.html', menuPolicyAppeals:'policy_appeals.html'
};

for (const [id, action] of Object.entries(runtimeActions)) {
  test(`${id} has a live delegated action contract`, () => {
    assert.match(feed, new RegExp(`id=["']${id}["'][^>]*data-menu-action=["']${action}["']`));
  });
}

for (const [id, route] of Object.entries(nativeRoutes)) {
  test(`${id} has a native route contract`, () => {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.match(feed, new RegExp(`id=["']${id}["'][^>]*href=["']${escaped}["']`));
  });
}

test('Menu V3 defines every runtime action exactly once', () => {
  for (const action of Object.values(runtimeActions)) {
    assert.match(runtime, new RegExp(`\\n    ${action}:`), `missing menu action: ${action}`);
  }
  assert.match(runtime, /menuOverlay\?\.addEventListener\('click', async e/);
  assert.match(runtime, /control\.dataset\.menuBusy === '1'/);
  assert.match(runtime, /toast\(err\?\.message \|\| 'That SPIKE action could not be opened/);
});


test('Feed-owned controls are not duplicated in Menu V3', () => {
  for (const id of ['menuCreate','menuDiscover','menuTrending','menuNearby','menuSignal','menuStory']) {
    assert.doesNotMatch(feed, new RegExp(`id=[\"']${id}[\"']`), `${id} should stay on Feed, not Menu`);
  }
  for (const action of ['create','discover','trending','nearby','signal','story']) {
    assert.doesNotMatch(runtime, new RegExp(`\\n\\s+${action}:`), `${action} should not be a Menu action`);
  }
});

test('Route-only menu entries are not dependent on JavaScript menu actions', () => {
  for (const [id] of Object.entries(nativeRoutes)) {
    const element = feed.match(new RegExp(`<[^>]*id=["']${id}["'][^>]*>`))?.[0] || '';
    assert.doesNotMatch(element, /data-menu-action=/, `${id} should navigate natively`);
  }
});
