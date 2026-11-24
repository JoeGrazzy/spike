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

test('direct-message typing uses a dedicated private Broadcast topic', () => {
  assert.match(source, /db\(\)\.channel\(`spike-dm-typing:\$\{conversationId\}`, \{ config: \{ private: true, broadcast: \{ ack: true, self: false \} \} \}\)/);
  assert.match(source, /\{ event: 'typing' \}/);
  assert.match(source, /typingChannelReady = status === 'SUBSCRIBED'/);
});

test('direct-message Postgres Changes use a separate RLS-protected channel', () => {
  assert.match(source, /db\(\)\.channel\(`spike-dm-db:\$\{conversationId\}`\)/);
  assert.doesNotMatch(source, /channel\(`spike-dm-db:\$\{conversationId\}`\s*,\s*\{\s*config:\s*\{\s*private:\s*true/);
  assert.match(source, /threadDbChannel = db\(\)\.channel/);
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

test('inbox previews refresh after message edits and deletes', () => {
  assert.match(source, /event: 'UPDATE', schema: 'public', table: 'messages'/);
  assert.match(source, /event: 'DELETE', schema: 'public', table: 'messages'/);
});

test('older-message pagination uses a stable timestamp and UUID cursor', () => {
  assert.match(source, /\.order\('created_at', \{ ascending: false \}\)\s*\.order\('id', \{ ascending: false \}\)/);
  assert.match(source, /created_at\.lt\.\$\{stamp\},and\(created_at\.eq\.\$\{stamp\},id\.lt\.\$\{oldest\.id\}\)/);
  assert.match(source, /existingIds = older \? new Set/);
});

test('live appended messages create a day divider when the date changes', () => {
  assert.match(source, /dateKey\(previousBubble\.dataset\.createdAt\) !== dateKey\(row\.created_at\)/);
  assert.match(source, /thread\.append\(dayDivider\(row\.created_at\)\)/);
});

test('presence fallback polling and event listeners are cleaned up on page exit', () => {
  assert.match(source, /if \(presenceRefreshTimer\) \{ clearInterval\(presenceRefreshTimer\)/);
  assert.match(source, /removeEventListener\('visibilitychange', presenceVisibilityHandler\)/);
});
