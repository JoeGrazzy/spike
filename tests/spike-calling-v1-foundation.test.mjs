import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261118120000_spike_calling_v1_foundation.sql'), 'utf8');
const control = fs.readFileSync(path.join(root, 'supabase/functions/spike-call-control/index.ts'), 'utf8');
const token = fs.readFileSync(path.join(root, 'supabase/functions/spike-agora-token/index.ts'), 'utf8');
const message = fs.readFileSync(path.join(root, 'message.html'), 'utf8');

test('calling foundation is separate from voice-note implementation', () => {
  assert.doesNotMatch(message, /RTCPeerConnection/);
  assert.match(message, /id="spikeVoiceCall"/);
  assert.match(message, /id="spikeVideoCall"/);
  assert.match(message, /id="voiceNote"/);
  assert.match(message, /new MediaRecorder\(/);
});

test('call records and participant reservations are RLS protected', () => {
  assert.match(migration, /alter table public\.spike_calls/i);
  assert.match(migration, /create table if not exists public\.spike_call_participants/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /spike_call_one_active_call_per_user_uq/i);
  assert.match(migration, /recipient_id/);
  assert.match(migration, /spike_call_participants_self_read/i);
});

test('call signalling inbox is receive-only for authenticated user topic', () => {
  assert.match(migration, /spike_users_receive_own_call_broadcasts/i);
  assert.match(migration, /topic='user:'\|\|\(select auth\.uid\(\)\)::text\|\|':calls'/i);
  assert.doesNotMatch(migration, /create policy[^;]+on realtime\.messages for insert/is);
});

test('control endpoint requires a verified Supabase user and delegates transitions to RPCs', () => {
  assert.match(control, /auth\.getUser\(authorization\.slice\(7\)\)/);
  assert.match(control, /spike_create_call/);
  assert.match(control, /spike_respond_to_call/);
  assert.match(control, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('Agora credentials are server-side and tokens are participant-scoped', () => {
  assert.match(token, /AGORA_APP_CERTIFICATE/);
  assert.match(token, /RtcTokenBuilder\.buildTokenWithUid/);
  assert.match(token, /call\.caller_id!==userData\.user\.id&&call\.recipient_id!==userData\.user\.id/);
  assert.match(token, /\["ringing","accepted","connected"\]/);
});
