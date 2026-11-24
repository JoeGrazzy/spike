import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/spike-messages.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../message.html', import.meta.url), 'utf8');

test('direct conversation bootstrap fetches the peer read timestamp', () => {
  assert.match(source, /db\(\)\.from\('conversation_members'\)\.select\('user_id,last_read_at'\)\.eq\('conversation_id',\s*conversationId\)/);
});

test('messaging controller startup is single-flight and can retry after failure', () => {
  assert.match(source, /if \(messagingStartPromise\) return messagingStartPromise/);
  assert.match(source, /catch \(error\) \{ messagingStartPromise = null; throw error; \}/);
});

test('direct-message typing uses the private conversation topic', () => {
  assert.match(source, /db\(\)\.channel\(`spike-dm:\$\{conversationId\}`, \{ config: \{ private: true, broadcast: \{ ack: true, self: false \} \} \}\)/);
  assert.match(source, /\{ event: 'typing' \}/);
});

test('call buttons stay disabled until one-to-one recipient and messaging permission are resolved', () => {
  assert.match(page, /id="voiceCallBtn" disabled aria-disabled="true"/);
  assert.match(page, /id="videoCallBtn" disabled aria-disabled="true"/);
  assert.match(source, /const setCallButtonsReady = ready =>/);
  assert.match(source, /if \(peerId\) \{\s*composerOpen = await canMessage\(peerId\);\s*setCallButtonsReady\(composerOpen\);/);
});

test('message private subscriptions wait for the authenticated Realtime token handoff', () => {
  assert.match(source, /await db\(\)\.auth\.getSession\(\)/);
  assert.match(source, /await db\(\)\.realtime\.setAuth\(session\.access_token\)/);
  assert.ok(source.indexOf('await db().realtime.setAuth(session.access_token)') < source.indexOf('await setupThread()'));
});
