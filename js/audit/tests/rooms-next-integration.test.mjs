import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rooms = fs.readFileSync('rooms.html', 'utf8');
const room = fs.readFileSync('room.html', 'utf8');
const roomChat = fs.readFileSync('room_chat.html', 'utf8');
const sharedCss = 'css/spike-rooms-next.css?v=1';

test('Rooms discovery and room owner page load the shared Rooms Next visual layer', () => {
  assert.ok(rooms.includes(sharedCss), 'rooms.html must load the shared Rooms Next stylesheet');
  assert.ok(room.includes(sharedCss), 'room.html must load the shared Rooms Next stylesheet');
  assert.ok(fs.existsSync('css/spike-rooms-next.css'), 'shared Rooms Next stylesheet must exist');
});

test('Rooms keeps the established route split and opens the real chat page', () => {
  assert.match(rooms, /room_chat\.html\?id=/, 'joining/opening a room must continue to route to room_chat.html');
  assert.match(rooms, /room\.html\?id=/, 'owner management must continue to route to room.html');
  assert.match(room, /room_chat\.html\?id=/, 'non-owner access must continue to resolve to the chat route');
  assert.match(roomChat, /data-spike-page="room_chat"/, 'the actual room chat page must remain present');
});

test('Rooms keeps the existing server-owned create and membership operations', () => {
  assert.match(rooms, /spikeRpcWrite\('room_create'/, 'room creation must use the established server RPC');
  assert.match(rooms, /from\('room_members'\)\.insert/, 'joining must retain the established membership write');
  assert.match(room, /room_send_message/, 'room messaging must remain on the server-owned send RPC');
});
