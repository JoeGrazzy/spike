import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const runtime = fs.readFileSync(path.join(ROOT, 'js/feed-runtime-04-3.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'feed.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/spike-android-menu-polish-v7.css'), 'utf8');
test('sign-out closes the feed menu before showing confirmation', () => {
  const start = runtime.indexOf('const showSignOutConfirmation = () => {');
  const end = runtime.indexOf('\n  const menuActions = {', start);
  assert.ok(start >= 0 && end > start);
  const handler = runtime.slice(start, end);
  assert.ok(handler.indexOf('closeFeedMenu()') < handler.indexOf("classList.add('show')"));
  assert.match(runtime, /signout:\s*showSignOutConfirmation/);
  assert.doesNotMatch(runtime, /bindClick\('menuSignOut'/, 'no duplicate direct click handler');
});
test('menu delegated actions stop propagation before running', () => {
  const start = runtime.indexOf("menuOverlay?.addEventListener('click', async e => {");
  const end = runtime.indexOf("\n  });", start);
  assert.ok(start >= 0 && end > start);
  const handler = runtime.slice(start, end);
  assert.ok(handler.indexOf('e.stopPropagation()') < handler.indexOf('await handler()'));
});
test('menu and logout confirmation have explicit non-overlapping interaction layers', () => {
  assert.match(html, /spike-android-menu-polish-v7\.css\?v=7/);
  assert.match(css, /#menuOverlay\.spike-menu-overlay\s*\{[^}]*z-index:\s*10040/);
  assert.match(css, /#logoutConfirmOverlay\s*\{[^}]*z-index:\s*10060/);
  assert.match(css, /#menuOverlay\[aria-hidden="true"\]\s*\{\s*pointer-events:\s*none/);
});
