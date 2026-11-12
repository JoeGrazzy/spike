import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('Room page has no multi-person voice/video call surface or runtime', async () => {
  const html = await readFile('room.html', 'utf8');
  assert.doesNotMatch(html, /roomCallPanel|roomCallAudio|roomCallVideo|spike-room-live-call-v1/);
  await assert.rejects(access('js/spike-room-live-call-v1.js'));
  await assert.rejects(access('js/spike-call-ice-config.js'));
});

test('original direct-message voice/video calling controller remains present', async () => {
  const dm = await readFile('js/spike-dm-realtime-calls-v2.js', 'utf8');
  assert.match(dm, /RTCPeerConnection/);
  assert.match(dm, /getUserMedia/);
});
