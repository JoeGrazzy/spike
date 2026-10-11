import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../../', import.meta.url);
const [html, adaptive, css] = await Promise.all([
  readFile(new URL('feed.html', root), 'utf8'),
  readFile(new URL('js/spike-adaptive-nav.js', root), 'utf8'),
  readFile(new URL('css/spike-menu-final-v10.css', root), 'utf8')
]);

test('V10.2 loads the final menu authority after legacy nav styles', () => {
  assert.match(html, /spike-menu-final-v10\.css\?v=10\.2/);
  assert.ok(html.indexOf('spike-menu-final-v10.css?v=10.2') > html.indexOf('spike-android-menu-polish-v7.css?v=7'));
});

test('V10.2 hides the dock with inline important styles when menu is open', () => {
  assert.match(adaptive, /#menuOverlay\.open, #menuOverlay\[aria-hidden="false"\]/);
  assert.match(adaptive, /nav\.style\.setProperty\('display','none','important'\)/);
  assert.match(adaptive, /nav\.style\.setProperty\('pointer-events','none','important'\)/);
});

test('V10.2 gives the menu the top interaction layer and hides dock for both menu states', () => {
  assert.match(css, /z-index:\s*120000\s*!important/);
  assert.match(css, /#menuOverlay\[aria-hidden="false"\]/);
  assert.match(css, /display:\s*none\s*!important/);
  assert.match(css, /pointer-events:\s*none\s*!important/);
});


test('V10.2 keeps Log Out in normal flow instead of covering menu rows', () => {
  assert.match(css, /#menuOverlay \.spike-command-footer\s*\{[^}]*position:\s*static\s*!important/s);
  assert.match(css, /#menuOverlay \.spike-command-footer\s*\{[^}]*bottom:\s*auto\s*!important/s);
  assert.match(css, /#menuOverlay \.spike-command-menu\s*\{[^}]*overflow-y:\s*auto\s*!important/s);
});
