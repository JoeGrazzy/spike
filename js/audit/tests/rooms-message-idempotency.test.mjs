import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile('js/spike-room-v2.js', 'utf8');
const migration = await readFile('supabase/migrations/20261112110000_spike_rooms_message_idempotency_v1.sql', 'utf8');

test('Room text sends use a stable client request ID and the idempotent backend RPC', () => {
  assert.match(runtime, /pendingMessageRequestId \|\|= crypto\.randomUUID\(\)/);
  assert.match(runtime, /room_public_send_message_idempotent/);
  assert.match(runtime, /p_client_message_id:\s*pendingMessageRequestId/);
  assert.match(runtime, /pendingMessageRequestId = null/);
});

test('Room send retries preserve the draft and do not claim delivery without a server row', () => {
  const start = runtime.indexOf('async function sendMessage(event)');
  const end = runtime.indexOf('\n  function setConnectionState', start);
  const send = runtime.slice(start, end);
  assert.match(send, /if \(!data\?\.id\) throw new Error/);
  assert.match(send, /catch \(error\)/);
  assert.match(send, /Your draft has been kept/);
  assert.ok(send.indexOf("pendingMessageRequestId = null") > send.indexOf("if (!data?.id)"));
});

test('Database idempotency is unique per sender and resolves retries before rate limits', () => {
  assert.match(migration, /add column if not exists client_message_id uuid/i);
  assert.match(migration, /unique index if not exists room_messages_sender_client_message_id_uidx/i);
  assert.match(migration, /on public\.room_messages \(user_id, client_message_id\)/i);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended/i);
  assert.match(migration, /on conflict \(user_id, client_message_id\).*do nothing/is);
  assert.ok(migration.indexOf('where user_id=v_uid and client_message_id=p_client_message_id') < migration.indexOf("room_rate_limit_check('message:'"));
  assert.match(migration, /is distinct from p_reply_to_id/i);
  assert.match(migration, /grant execute on function public\.room_public_send_message_idempotent\(uuid,uuid,text,uuid,uuid\) to authenticated/i);
});

test('Phase 10 adds no financial integration and preserves the original send RPC', () => {
  assert.doesNotMatch(runtime, /wallet|coin|payment|billing|checkout|purchase/i);
  assert.match(migration, /room_public_send_message_idempotent/);
  assert.doesNotMatch(migration, /drop function|drop table|delete from public\.room_messages/i);
});
