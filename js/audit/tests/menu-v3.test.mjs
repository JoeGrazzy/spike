import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const feed = fs.readFileSync(path.join(ROOT, 'feed.html'), 'utf8');
const runtime = fs.readFileSync(path.join(ROOT, 'js/feed-runtime-04-3.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/spike-menu-v3.css'), 'utf8');

test('Feed uses the hierarchy-first Menu V3 architecture', () => {
  for (const id of ['menuGoLive','menuMessages','menuNotifications','menuProfile','menuFriends','menuSaved','menuAudience','menuRoom','menuProgress','menuWorld','menuGuide','menuSbet','menuIntelligence','menuSettings','menuSafety','menuPolicy','menuPolicyAppeals','menuSignOut']) {
    assert.match(feed, new RegExp(`id=["']${id}["']`), `missing menu control: ${id}`);
  }
  assert.match(feed, /class="menu-v3-disclosure"/);
  assert.match(feed, /<div class="menu-v3-label">QUICK ACTIONS<\/div>/);
  assert.match(feed, /<div class="menu-v3-label">YOUR SPIKE<\/div>/);
  assert.match(feed, /<div class="menu-v3-label">DISCOVER<\/div>/);
});

test('Menu V3 keeps navigation actions on the existing routes/runtime contracts', () => {
  const combined = `${feed}\n${runtime}`;
  for (const route of ['live.html?start=1','notifications.html','messages.html','friends.html','spike_world.html','spike_predictor.html','spike_intelligence.html','settings.html','policy.html','policy_appeals.html','leveling.html']) {
    assert.match(combined, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(runtime, /menuOverlay\?\.addEventListener\('click', async e/);
  assert.match(runtime, /data-menu-action/);
  assert.match(runtime, /spike:notification-count/);
});

test('Menu V3 is responsive and disclosure-based rather than a giant flat card list', () => {
  assert.match(css, /max-height:min\(90dvh/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.menu-v3-disclosure\s+summary/);
  assert.match(css, /@media\(max-width:520px\)/);
});
