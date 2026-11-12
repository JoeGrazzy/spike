import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const files = ['rooms.html','room.html','js/spike-rooms-v2.js','js/spike-room-v2.js','css/spike-rooms-v2.css','js/spike-room-v2.js'];
const read = file => readFile(file,'utf8');

test('replacement pages use the existing SPIKE Room backend, not a parallel V2 schema', async () => {
  const [directory, room, directoryJs, roomJs] = await Promise.all(files.slice(0,4).map(read));
  assert.match(directory, /data-spike-page="rooms"/);
  assert.match(room, /data-spike-page="room"/);
  assert.match(directoryJs, /rpc\('rooms_discover'/);
  assert.match(directoryJs, /rpc\('room_public_create'/);
  assert.match(directoryJs, /rpc\('room_public_join'/);
  assert.doesNotMatch(directoryJs, /from\('room_members'\)\.insert/);
  assert.match(directoryJs, /from\('room_members'\)/);
  assert.match(roomJs, /from\('rooms'\)/);
  assert.match(roomJs, /from\('room_channels'\)/);
  assert.match(roomJs, /from\('room_messages'\)/);
  assert.match(roomJs, /rpc\('room_public_send_message_idempotent'/);
  assert.match(roomJs, /rpc\('room_public_members_page'/);
  assert.match(roomJs, /rpc\('room_public_join'/);
  assert.match(roomJs, /rpc\('room_public_leave'/);
  assert.match(roomJs, /rpc\('room_toggle_reaction'/);
  assert.match(roomJs, /rpc\('room_toggle_pin'/);
  assert.match(roomJs, /rpc\('room_poll_vote'/);
  assert.match(roomJs, /rpc\('room_announcement_create'/);
  assert.match(roomJs, /rpc\('room_poll_create'/);
  assert.match(roomJs, /data-reply=/);
  assert.match(roomJs, /p_reply_to_id:\s*replyTarget/);
  assert.match(roomJs, /rpc\('room_members_list'/);
  assert.match(roomJs, /room_moderation_ban/);
  assert.match(roomJs, /room_moderation_mute/);
  assert.match(roomJs, /room_moderation_remove/);
  assert.match(roomJs, /room_event_create/);
  assert.match(roomJs, /room_events/);
  assert.match(roomJs, /room_public_send_media_message/);
  assert.match(roomJs, /createSignedUrls/);
  assert.match(roomJs, /toggleVoiceRecording/);
  assert.match(roomJs, /room_public_members_page/);
  assert.doesNotMatch([directoryJs,roomJs].join('\n'), /spike_room_[a-z0-9_]*_v2|spike_rooms_v2/i);
  await assert.rejects(access('supabase/migrations/20261112101500_spike_rooms_v2_free_foundation_v1.sql'));
});

test('Rooms frontend has no financial integrations or financial UI', async () => {
  const sources = await Promise.all(files.map(read));
  const combined = sources.join('\n');
  const forbidden = /\b(wallet|coin|jcoin|spcoin|payment|billing|purchase|checkout|transaction|price|currency|paystack|stripe|balance|deduct|charge|entry_fee|create_cost)\b/i;
  assert.doesNotMatch(combined, forbidden);
});

test('Room messaging uses the channel-aware server RPC and live existing Realtime table', async () => {
  const source = await read('js/spike-room-v2.js');
  assert.match(source, /rpc\('room_public_send_message_idempotent'/);
  assert.match(source, /p_channel_id:\s*channel\.id/);
  assert.match(source, /table:\s*'room_messages'/);
  assert.doesNotMatch(source, /from\('room_messages'\)\.insert/);
});

test('member profile lookups respect SPIKE profile privacy and native dialogs are avoided', async () => {
  const source = await read('js/spike-room-v2.js');
  assert.match(source, /rpc\('get_public_profiles'/);
  assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\s*\(/);
  assert.match(await read('room.html'), /id="leaveBackdrop"/);
});


test('Room lifecycle and collaboration endpoints are server-authoritative and free', async () => {
  const [directory, room] = await Promise.all([read('js/spike-rooms-v2.js'), read('js/spike-room-v2.js')]);
  assert.match(directory, /room_public_create/);
  assert.match(directory, /room_public_join/);
  assert.doesNotMatch(directory, /from\('room_members'\)\.insert/);
  assert.match(room, /room_public_leave/);
  assert.match(room, /room_public_join/);
  assert.match(room, /room_public_send_message/);
  assert.match(room, /room_poll_vote/);
  assert.match(room, /room_toggle_reaction/);
  assert.match(room, /room_toggle_pin/);
  assert.match(room, /room_event_create/);
  assert.doesNotMatch([directory, room].join('\n'), /room_coin_wallet|room_coin_ledger|room_buy_event_with_coins|room_create_coin_order|room_submit_payment_transaction/i);
});
