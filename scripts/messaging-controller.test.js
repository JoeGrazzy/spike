import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/spike-messaging.js', import.meta.url), 'utf8');

test('direct conversation bootstrap fetches the peer read timestamp', () => {
  assert.match(source, /from\('conversation_members'\)\.select\('user_id,last_read_at'\)\.eq\('conversation_id',conversationId\)/);
});

test('messaging controller startup is single-flight and can retry after failure', () => {
  assert.match(source, /if \(messagingStartPromise\) return messagingStartPromise/);
  assert.match(source, /catch \(error\) \{ messagingStartPromise = null; throw error; \}/);
});

test('direct-message typing uses the same private conversation topic for both participants', () => {
  assert.match(source, /channel=db\(\)\.channel\(`spike-dm:\$\{conversationId\}`,\{config:\{private:true,broadcast:\{ack:true,self:false\}\}\}\)/);
  assert.match(source, /event:'typing'/);
});


test('call buttons stay disabled until one-to-one recipient and messaging permission are resolved', () => {
  const page = readFileSync(new URL('../message.html', import.meta.url), 'utf8');
  assert.match(page, /id="voiceCallBtn" disabled aria-disabled="true"/);
  assert.match(page, /id="videoCallBtn" disabled aria-disabled="true"/);
  assert.match(source, /const setCallButtonsReady = ready =>/);
  assert.match(source, /const peerId=peerIds\.length===1\?peerIds\[0\]:null/);
  assert.match(source, /if\(allowed===true\) setCallButtonsReady\(true\)/);
  assert.ok(source.indexOf('setCallButtonsReady(true)') > source.indexOf("rpc('can_message_spike_user'"));
});
