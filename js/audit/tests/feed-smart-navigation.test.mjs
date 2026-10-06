import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../../feed.html', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../../../js/feed-runtime-05.js', import.meta.url), 'utf8');

test('Feed exposes the existing Smart Navigation panel from the header', () => {
  assert.match(html, /id="spikeSmartNavBtn"/);
  assert.match(html, /aria-controls="spikeSmartNav"/);
  assert.doesNotMatch(html, /id="spike-feed-hidden-legacy-nav"/);
  assert.match(html, /id="spikeSmartNav"/);
});

test('Smart Navigation Activity has a working route without a legacy nav item', () => {
  assert.match(runtime, /if\(key==='activity'\)[\s\S]*?window\.location\.href='notifications\.html'/);
  assert.match(runtime, /const legacy=document\.querySelector/);
});


test('hidden existing feed utilities have visible menu entry points wired to their original controls', async () => {
  const feed = await readFile(new URL('../../../feed.html', import.meta.url), 'utf8');
  const runtime = await readFile(new URL('../../feed-runtime-04-3.js', import.meta.url), 'utf8');
  for (const [id, action] of [['menuAskSpike','ask-spike'],['menuCoffee','coffee'],['menuTheme','theme'],['menuPulse','pulse']]) {
    assert.match(feed, new RegExp(`id=\"${id}\"[^>]*data-menu-action=\"${action}\"`));
    assert.ok(runtime.includes(`'${action}':`) || runtime.includes(`${action}:`), `missing menu action ${action}`);
  }
  assert.match(runtime, /const openAskSpike = \(/);
  assert.match(runtime, /overlay\.classList\.add\('open'\)/);
  assert.match(runtime, /window\.location\.assign\('coffee\.html'\)/);
  assert.match(runtime, /window\.SPIKE_THEME\?\.next/);
  assert.match(runtime, /window\.SPIKE_OPEN_PULSE/);
  assert.doesNotMatch(runtime, /activateExistingUtility/);
});
