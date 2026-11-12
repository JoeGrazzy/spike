import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile('js/spike-room-v2.js', 'utf8');
const page = await readFile('room.html', 'utf8');

test('Room realtime recovers after network return and visible-tab restoration', () => {
  assert.match(runtime, /window\.addEventListener\('online', recoverRealtime\)/);
  assert.match(runtime, /document\.addEventListener\('visibilitychange'/);
  assert.match(runtime, /function recoverRealtime\(\)/);
  assert.match(runtime, /status === 'TIMED_OUT'/);
  assert.match(runtime, /await db\.removeChannel\(subscription\)/);
  assert.match(runtime, /await db\.removeChannel\(memberSubscription\)/);
});

test('Room reconnect refreshes canonical server state after subscription is restored', () => {
  assert.match(runtime, /async function refreshAfterReconnect\(\)/);
  for (const fn of ['loadMessages()', 'loadMembers()', 'loadAnnouncements()', 'loadPolls()', 'loadEvents()', 'loadRoomSettings()']) {
    assert.ok(runtime.includes(fn), `expected recovery refresh to include ${fn}`);
  }
  assert.match(runtime, /if \(realtimeConnected\) refreshAfterReconnect\(\)/);
});

test('Room send failures preserve the draft and never claim a failed message was delivered', () => {
  const start = runtime.indexOf('async function sendMessage(event)');
  const end = runtime.indexOf('\n  function setConnectionState', start);
  const send = runtime.slice(start, end);
  assert.match(send, /if \(!data\?\.id\) throw new Error/);
  assert.match(send, /catch \(error\)/);
  assert.match(send, /pendingMessageRequestId = null/);
  assert.ok(send.indexOf("pendingMessageRequestId = null") > send.indexOf("if (!data?.id)"));
});

test('Room reliability changes remain free of financial dependencies', () => {
  assert.doesNotMatch(runtime, /wallet|coin|payment|billing|checkout|purchase/i);
  assert.match(page, /js\/spike-room-v2\.js/);
});
