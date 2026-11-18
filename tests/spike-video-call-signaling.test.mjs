import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261118095932_spike_new_direct_video_call_signaling_v1.sql', import.meta.url), 'utf8');
const page = readFileSync(new URL('../video_call.html', import.meta.url), 'utf8');
const client = readFileSync(new URL('../js/video-call.js', import.meta.url), 'utf8');
const incoming = readFileSync(new URL('../js/video-call-incoming.js', import.meta.url), 'utf8');
const message = readFileSync(new URL('../message.html', import.meta.url), 'utf8');

test('call tables are RLS protected and browser writes are least-privilege', () => {
  assert.match(migration, /alter table public\.spike_video_calls enable row level security/i);
  assert.match(migration, /alter table public\.spike_video_call_signals enable row level security/i);
  assert.match(migration, /grant select on public\.spike_video_calls to authenticated/i);
  assert.match(migration, /grant select, insert on public\.spike_video_call_signals to authenticated/i);
  assert.doesNotMatch(migration, /grant[^;]*update[^;]*spike_video_calls/i);
  assert.doesNotMatch(migration, /grant[^;]*delete[^;]*spike_video_call_signals/i);
});

test('call state transitions are exposed only through authenticated invoker wrappers', () => {
  assert.match(migration, /create or replace function private\.spike_video_call_start[\s\S]*?security definer/i);
  assert.match(migration, /create or replace function public\.spike_video_call_start[\s\S]*?security invoker/i);
  assert.match(migration, /create or replace function public\.spike_video_call_respond[\s\S]*?security invoker/i);
  assert.match(migration, /create or replace function public\.spike_video_call_end[\s\S]*?security invoker/i);
  assert.match(migration, /revoke all on function public\.spike_video_call_start[\s\S]*?from public, anon/i);
});

test('Realtime publishes call rows and signaling rows', () => {
  assert.match(migration, /alter publication supabase_realtime add table public\.spike_video_calls/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.spike_video_call_signals/i);
});

test('call page supports video, voice, accept, decline, and WebRTC signaling', () => {
  for (const id of ['remoteVideo','remoteAudio','localVideo','acceptCall','micToggle','cameraToggle','endCall']) assert.match(page, new RegExp(`id="${id}"`));
  for (const token of ["'offer'", "'answer'", "'ice'", 'RTCPeerConnection', 'spike_video_call_start', 'spike_video_call_respond', 'spike_video_call_end']) assert.ok(client.includes(token), `missing ${token}`);
});

test('direct messages expose both call types and incoming-call prompt', () => {
  assert.match(message, /id="audioCallLink"/);
  assert.match(message, /id="videoCallLink"/);
  assert.match(message, /video-call-incoming\.js/);
  assert.match(incoming, /spike_video_calls/);
  assert.match(incoming, /spike_video_call_respond/);
});
