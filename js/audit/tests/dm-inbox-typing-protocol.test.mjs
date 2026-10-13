import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const inbox = await readFile('messages.html', 'utf8');
const thread = await readFile('message.html', 'utf8');
const signals = await readFile('js/spike-dm-signals.js', 'utf8');
test('Inbox and conversation use the same shared pair-scoped typing manager', () => {
  assert.match(inbox, /signals\.subscribeTyping\(db,me\.id,id/);
  assert.match(thread, /signals\.subscribeTyping\(db,me\.id,other/);
  assert.match(signals, /const PREFIX = 'spike:dm-typing:v1:'/);
  assert.match(signals, /function pairTopic\(a, b\)/);
});
test('Shared typing contract validates participants and never transmits draft content', () => {
  assert.match(signals, /lower\(payload\.from\) !== peer/);
  assert.match(signals, /lower\(payload\.to\) !== self/);
  assert.match(signals, /payload: \{ from: lower\(from\), to: lower\(to\), typing: typing === true \}/);
  assert.doesNotMatch(signals, /body:|text:|draft:/);
});
