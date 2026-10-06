import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const read = p => readFile(new URL(`../../../${p}`, import.meta.url), 'utf8');

test('Android full-screen shared responsive stylesheet is included on app pages', async () => {
  const files = (await readdir(new URL('../../../', import.meta.url))).filter(x => x.endsWith('.html'));
  assert.ok(files.length >= 25, `Expected production HTML pages, got ${files.length}`);
  for (const file of files) {
    const html = await read(file);
    assert.match(html, /css\/spike-android-fullscreen-v1\.css\?v=1/, `${file} is missing shared fullscreen CSS`);
  }
});

test('Feed restores the fixed bottom navigation hidden by a conflicting ID rule', async () => {
  const html = await read('feed.html');
  const css = await read('css/spike-android-feed-v1.css');
  assert.match(html, /css\/spike-android-feed-v1\.css\?v=1/);
  assert.match(html, /name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"|content="width=device-width,initial-scale=1,viewport-fit=cover" name="viewport"/);
  assert.ok(!html.includes('#spikeBottomNav{display:none!important;visibility:hidden!important;pointer-events:none!important;}'), 'stale unconditional ID hide rule must stay removed');
  assert.match(css, /#spikeBottomNav\s*\{[\s\S]*?display:\s*grid\s*!important/);
  assert.match(css, /padding-bottom:\s*calc\(104px \+ env\(safe-area-inset-bottom/);
});

test('remote avatar failures are selected for a graceful initials fallback', async () => {
  const js = await read('js/spike-identity.js');
  assert.match(js, /data-spike-remote-avatar/);
  assert.match(js, /img\[data-spike-remote-avatar\]/);
  assert.match(js, /holder\.textContent=initials\(/);
});
