import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../../../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
test('full-page SPIKE loaders share the premium visual system', async () => {
 const css = await read('css/spike-premium-loader.css');
 assert.match(css, /linear-gradient\(90deg,#7c3aed 0%,#d946ef 48%,#ffca72 100%\)/);
 assert.match(css, /prefers-reduced-motion:reduce/);
 for (const file of ['index.html','profile.html','view_user.html','notifications.html']) {
  const html = await read(file);
  assert.match(html, /css\/spike-premium-loader\.css/, `${file} must load shared loader styles`);
  assert.match(html, /aria-live="polite"/, `${file} loader must announce its state accessibly`);
 }
 const feed = await read('feed.html');
 assert.match(feed, /spike-feed-loader-card/);
 assert.match(feed, /id="spikeFeedRetry"[^>]*hidden/);
 assert.doesNotMatch(feed, /Retry connection/);
});
test('shared loader styling does not override loader lifecycle classes', async () => {
 const css = await read('css/spike-premium-loader.css');
 assert.match(css, /\.loader#loader\.hide/);
 assert.match(css, /\.loader#loader\.hidden/);
 assert.match(css, /#spike-auth-loader\.is-hidden/);
});
