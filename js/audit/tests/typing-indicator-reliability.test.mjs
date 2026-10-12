import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dm = await readFile(new URL('../../spike-dm-realtime-calls-v2.js', import.meta.url), 'utf8');
const message = await readFile(new URL('../../../message.html', import.meta.url), 'utf8');
const room = await readFile(new URL('../../../room_chat.html', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../../supabase/migrations/20261012150000_spike_dm_typing_realtime_authorization_v1.sql', import.meta.url), 'utf8');

test('DM typing rejects stale channel callbacks and sends only on the current subscribed channel', () => {
  assert.match(dm, /dmChannelGeneration=0/);
  assert.match(dm, /if\(generation!==dmChannelGeneration\|\|channel!==dmChannel\)return/);
  assert.match(dm, /if\(!channel\|\|!dmChannelReady\|\|!me/);
  assert.match(dm, /channel\.send\(\{type:'broadcast',event:'typing'/);
  assert.match(dm, /\[SPIKE DM typing\] Broadcast failed/);
});

test('DM typing UI creates accessible animated dots without exposing diagnostics to users', () => {
  assert.match(dm, /function showRemoteTyping\(\)/);
  assert.match(dm, /className='spike-typing-dots'/);
  assert.match(message, /@keyframes spikeTypingPulse/);
  assert.match(message, /spike-dm-realtime-calls-v2\.js\?v=sitewide-calls-v16/);
  assert.doesNotMatch(message, /SPIKE typing diagnostics/);
});

test('room typing sends only on a subscribed channel and ignores stale channel events', () => {
  assert.doesNotMatch(room, /channel\.httpSend\('typing'/);
  assert.match(room, /presenceReady:false,presenceGeneration:0/);
  assert.match(room, /state\.presenceReady=true/);
  assert.match(room, /channel\.send\(\{type:'broadcast',event:'typing',payload\}\)/);
  assert.match(room, /presenceGeneration!==state\.presenceGeneration\|\|presence!==state\.presence/);
  assert.match(room, /function renderTyping\(\)/);
  assert.match(room, /className='spike-typing-dots'/);
  assert.match(room, /\[SPIKE room typing\] Room broadcast channel unavailable/);
});

test('private DM typing topic is authorized only for authenticated pair participants', () => {
  assert.match(migration, /ON realtime\.messages FOR SELECT TO authenticated/i);
  assert.match(migration, /ON realtime\.messages FOR INSERT TO authenticated/i);
  assert.match(migration, /split_part\(topic, ':', 2\) = 'dm'/);
  assert.match(migration, /split_part\(topic, ':', 3\).*auth\.uid\(\)/s);
  assert.match(migration, /split_part\(topic, ':', 4\).*auth\.uid\(\)/s);
});
