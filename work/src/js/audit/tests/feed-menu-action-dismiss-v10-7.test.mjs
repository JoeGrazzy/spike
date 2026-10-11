import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../../../', import.meta.url);
const runtime = readFileSync(new URL('js/feed-runtime-04-3.js', root), 'utf8');
const html = readFileSync(new URL('feed.html', root), 'utf8');
test('V10.7 closes menu before menu destinations and feature actions execute', () => {
  assert.match(runtime, /menuOverlay\?\.addEventListener\('click', event => \{[\s\S]*?const action = target\.closest\('\[data-menu-action\]'\);[\s\S]*?const link = target\.closest\('a\[href\]'\);[\s\S]*?if \(action \|\| link\) closeFeedMenu\(\);[\s\S]*?\}, \{ capture: true \}\);/);
});
test('V10.7 leaves the More-tools disclosure available and refreshes menu runtime cache key', () => {
  assert.match(runtime, /if \(action \|\| link\) closeFeedMenu\(\)/);
  assert.match(html, /feed-runtime-04-3\.js\?v=menu-action-dismiss-v10\.7/);
});
