import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Inbox bounds initial message history and does not reload it for each realtime message', async () => {
  const inbox = await readFile(new URL('../../../messages.html', import.meta.url), 'utf8');
  assert.match(inbox, /async function loadInboxSummaries\(userId\)/);
  assert.match(inbox, /rpc\('spike_get_inbox_summaries'\)/);
  assert.match(inbox, /\.limit\(500\)/);
  assert.doesNotMatch(inbox.slice(inbox.indexOf('async function loadInboxSummaries'), inbox.indexOf('async function applyIncomingInboxMessage')), /while\s*\(true\)/);
  assert.match(inbox, /async function applyIncomingInboxMessage\(incoming\)/);
  const start = inbox.indexOf("channel=db.channel('spike-inbox-");
  const realtime = inbox.slice(start, inbox.indexOf('}).subscribe();', start));
  assert.match(realtime, /applyIncomingInboxMessage\(payload\.new\)/);
  assert.doesNotMatch(realtime, /loadAllInboxMessages/);
});

test('Typing subscriptions are bounded for large inboxes', async () => {
  const inbox = await readFile(new URL('../../../messages.html', import.meta.url), 'utf8');
  assert.match(inbox, /for\(const id of ids\.slice\(0,30\)\)/);
});

test('Presence DOM observer does not trigger a network refresh for every mutation', async () => {
  const script = await readFile(new URL('../../../js/presence-timestamps.js', import.meta.url), 'utf8');
  const observer = script.slice(script.indexOf('new MutationObserver'), script.indexOf("window.addEventListener('online'"));
  assert.match(observer, /requestAnimationFrame/);
  assert.match(observer, /AppPresence\?\.watch/);
  assert.doesNotMatch(observer, /refresh\(\)/);
});
