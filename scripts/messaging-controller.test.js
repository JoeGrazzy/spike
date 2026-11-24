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
