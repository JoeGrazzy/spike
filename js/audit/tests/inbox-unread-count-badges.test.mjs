import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../../messages.html', import.meta.url), 'utf8');

test('Inbox shows per-conversation unread count badges and a total unread filter badge', () => {
  assert.match(html, /id="unreadTotalBadge"/);
  assert.match(html, /class="unread-badge"/);
  assert.match(html, /r\.unreadCount/);
  assert.match(html, /unreadTotal>99\?'99\+'/);
});

test('Unread counts refresh from unread incoming messages and react to read-state updates', () => {
  assert.match(html, /recipient_id',me\.id\)\.or\('read\.eq\.false,read\.is\.null'\)/);
  assert.match(html, /event:'UPDATE'.*table:'private_messages'/);
  assert.match(html, /event:'INSERT'.*table:'private_messages'/);
  assert.match(html, /refreshInboxFromRealtime/);
});

test('Unread badges are accessible and hidden when there are no unread messages', () => {
  assert.match(html, /aria-label=\"\$\{count\} unread message/);
  assert.match(html, /badge\.hidden=unreadTotal<1/);
});
