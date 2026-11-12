import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rooms = await readFile('rooms.html','utf8');
const migration = await readFile('supabase/migrations/20261006133000_add_simple_room_recommendations.sql','utf8');

test('Rooms keeps ranking simple and visible',()=>{
  assert.match(rooms,/id="topRoomsSection"/);
  assert.match(rooms,/id="topRooms"/);
  assert.match(rooms,/Top Rooms/);
  assert.match(rooms,/Your Rooms/);
  assert.match(rooms,/Discover Rooms/);
});

test('Room ranking is server-authoritative and activity based',()=>{
  assert.match(rooms,/spikeRpcRead\('rooms_recommended'/);
  assert.match(migration,/create or replace function public\.rooms_recommended/);
  assert.match(migration,/room_members/);
  assert.match(migration,/room_messages/);
  assert.match(migration,/order by s\.rank_score desc/);
  assert.doesNotMatch(rooms,/Math\.random\(|Date\.now\(\).*score/);
});
