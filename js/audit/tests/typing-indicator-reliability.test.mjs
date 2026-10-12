import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dm = await readFile(new URL('../../spike-dm-realtime-calls-v2.js', import.meta.url), 'utf8');
const room = await readFile(new URL('../../../room_chat.html', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../../supabase/migrations/20261012150000_spike_dm_typing_realtime_authorization_v1.sql', import.meta.url), 'utf8');

test('DM typing only broadcasts after private channel subscription is ready and reports failures', () => {
  assert.match(dm, /dmChannelReady=false/);
  assert.match(dm, /if\(s==='SUBSCRIBED'\)\{dmChannelReady=true/);
  assert.match(dm, /\[SPIKE DM typing\] Broadcast failed/);
  assert.match(dm, /Check the deployed realtime\.messages SELECT\/INSERT policies for spike:dm topics/);
});

test('room typing uses the subscribed Realtime channel send path and reports failures', () => {
  assert.doesNotMatch(room, /channel\.httpSend\(/);
  assert.match(room, /state\.presenceReady=false/);
  assert.match(room, /state\.presenceReady=true/);
  assert.match(room, /channel\.send\(\{type:'broadcast',event:'typing',payload\}\)/);
  assert.match(room, /\[SPIKE room typing\] Broadcast failed/);
  assert.match(room, /Room broadcast channel unavailable/);
});

test('private DM typing topic is authorized only for authenticated pair participants', () => {
  assert.match(migration, /ON realtime\.messages FOR SELECT TO authenticated/i);
  assert.match(migration, /ON realtime\.messages FOR INSERT TO authenticated/i);
  assert.match(migration, /split_part\(topic, ':', 2\) = 'dm'/);
  assert.match(migration, /split_part\(topic, ':', 3\) = \(SELECT auth\.uid\(\)\)::text/);
  assert.match(migration, /split_part\(topic, ':', 4\) = \(SELECT auth\.uid\(\)\)::text/);
});
