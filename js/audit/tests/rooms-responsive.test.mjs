import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('Rooms pages load one scoped responsive authority after shared theme layers', async () => {
  for (const page of ['rooms.html', 'room.html']) {
    const html = await read(page);
    assert.match(html, /css\/spike-rooms-responsive-v2\.css\?v=2/);
    assert.doesNotMatch(html, /spike-rooms-layout-polish-v1\.css/);
    assert.ok(html.indexOf('spike-rooms-responsive-v2.css') > html.indexOf('spike-rooms-v2.css'));
  }
});

test('Rooms responsive authority covers narrow phones, tablet, safe areas and reduced motion', async () => {
  const css = await read('css/spike-rooms-responsive-v2.css');
  for (const token of ['max-width:900px', 'max-width:600px', 'max-width:380px', 'max-width:320px', 'safe-area-inset-top', 'safe-area-inset-bottom', 'prefers-reduced-motion']) {
    assert.ok(css.includes(token), `Missing responsive rule: ${token}`);
  }
  for (const selector of ['.rv-grid', '.rv-chat-layout', '.rv-composer', '.rv-member-list', '.rv-modal', '.rv-staff-tools']) {
    assert.ok(css.includes(selector), `Missing layout coverage: ${selector}`);
  }
});

test('Rooms no longer reference the retired group-call initializer', async () => {
  const js = await read('js/spike-room-v2.js');
  assert.doesNotMatch(js, /SpikeRoomLiveCall|spike-room-live-call/);
});
