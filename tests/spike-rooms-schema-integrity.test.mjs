import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../js/${name}`, import.meta.url), 'utf8');
const bootstrap = read('spike-room-bootstrap.js');
const chat = read('spike-room-chat.js');
const features = read('spike-room-features.js');

test('room invite bootstrap uses the deployed room_invites table', () => {
  assert.match(bootstrap, /from\('room_invites'\)/);
  assert.doesNotMatch(bootstrap, /from\('spike_room_invites'\)/);
});

test('room chat uses deployed room_messages and actual reply column', () => {
  assert.match(chat, /from\('room_messages'\)/);
  assert.match(chat, /reply_to_message_id:reply_to_id/);
  assert.doesNotMatch(chat, /from\('spike_room_messages'\)/);
});

test('room member queries use actual role and left_at fields', () => {
  for (const source of [chat, features]) {
    assert.match(source, /from\('room_members'\)/);
    assert.match(source, /member_role/);
    assert.match(source, /\.is\('left_at',null\)/);
    assert.doesNotMatch(source, /from\('spike_room_members'\)|member_state/);
  }
});

test('room metadata refresh reads the deployed rooms table', () => {
  assert.match(chat, /from\('rooms'\)\.select\('title,status,allow_chat:chat_enabled,active_host_id'\)/);
  assert.doesNotMatch(chat, /from\('spike_rooms'\)/);
});

test('owner-only room controls align with deployed owner-only RLS', () => {
  assert.match(features, /if\(!state\.owner\).*Only the room owner can change room settings/s);
  assert.match(features, /if\(!state\.owner\).*Only the room owner can customize this room/s);
  assert.match(features, /if\(!state\.owner\).*Only the room owner can end this room/s);
});

test('Room discovery includes the signed-in owner private rooms as well as public rooms',()=>{const discovery=read('spike-rooms-controller.js');assert.match(discovery,/visibility\.eq\.public,owner_id\.eq\.\$\{state\.user\.id\}/);});

test('Room moderation UI uses the same owner or active-host authority as database RPCs',()=>{const features=read('spike-room-features.js');assert.match(features,/state\.moderator=state\.host/);assert.doesNotMatch(features,/state\.moderator=state\.host\|\|mine\?\.member_role/);});
