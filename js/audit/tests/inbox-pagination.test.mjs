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



test('Presence peer watches are delegated to the central runtime', async () => {
  const script = await readFile(new URL('../../../js/presence.js', import.meta.url), 'utf8');
  const inbox = await readFile(new URL('../../../messages.html', import.meta.url), 'utf8');
  assert.match(inbox, /AppPresence\?\.watch\?\.\(list\.map\(r=>r\.other\)\)/);
  assert.match(script, /function watch\(ids\)/);
  assert.match(script, /async function lookup\(\)/);
  assert.doesNotMatch(inbox, /presence-timestamps\.js/);
});
