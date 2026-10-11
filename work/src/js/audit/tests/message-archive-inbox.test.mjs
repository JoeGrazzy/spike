import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Inbox filters archived conversations using the same per-user key as message.html', async () => {
  const inbox = await readFile(new URL('../../../messages.html', import.meta.url), 'utf8');
  const conversation = await readFile(new URL('../../../message.html', import.meta.url), 'utf8');
  assert.match(inbox, /data-filter="archived">Archived/);
  assert.match(inbox, /spike:archived-conversations:\$\{me\?\.id\|\|''\}/);
  assert.match(inbox, /filter==='archived'\?isArchived:!isArchived/);
  assert.match(inbox, /data-unarchive/);
  assert.match(conversation, /spike:archived-conversations:/);
  assert.match(inbox, /Unarchive conversation with/);
});
