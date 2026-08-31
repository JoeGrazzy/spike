import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';

const pages = ['friends.html','messages.html','message.html','notifications.html','profile.html','rooms.html','room.html','room_chat.html','chat_room.html','settings.html','help.html','spike_predictor.html','admin.html'];
for (const page of pages) {
  test(`back button: ${page}`, async () => {
    const html = await readFile(page, 'utf8');
    assert.equal((html.match(/data-spike-premium-back=/g) ?? []).length, 1);
    assert.match(html, /js\/premium-back\.js/);
    assert.match(html, /css\/premium-back\.css/);
  });
}
for (const page of ['index.html','feed.html']) {
  test(`entry page has no back control: ${page}`, async () => {
    const html = await readFile(page, 'utf8');
    assert.equal((html.match(/data-spike-premium-back=/g) ?? []).length, 0);
  });
}
