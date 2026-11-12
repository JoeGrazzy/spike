import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rooms = await readFile('rooms.html','utf8');
const room = await readFile('room.html','utf8');
const migration = await readFile('supabase/migrations/20261006213515_room_owner_picture_update.sql','utf8');

test('Room creation keeps one simple optional picture field',()=>{
  assert.match(rooms,/id="roomPicture" type="file"/);
  assert.match(rooms,/accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(rooms,/Room picture/);
  assert.match(rooms,/up to 5 MB/);
  assert.match(rooms,/id="roomPicturePreview"/);
});

test('Room picture uses the existing room-media storage bucket and room_create avatar_url',()=>{
  assert.match(rooms,/sb\.storage\.from\('room-media'\)\.upload/);
  assert.match(rooms,/sb\.storage\.from\('room-media'\)\.getPublicUrl/);
  assert.match(rooms,/p_avatar_url:pictureUrl/);
  assert.match(rooms,/p_cover_url:null/);
  assert.match(rooms,/sb\.storage\.from\('room-media'\)\.remove\(\[uploadedPath\]\)/);
});

test('Room picture upload is validated before upload',()=>{
  assert.match(rooms,/file\.size>5\*1024\*1024/);
  assert.ok(rooms.includes('image\\/(jpeg|png|webp)'), 'image type validation is missing');
  assert.doesNotMatch(rooms,/Cloudinary.*room|room.*Cloudinary/i);
});

test('Existing Room creator can change or remove the Room picture from Manage',async()=>{
  assert.match(room,/id="adminRoomPicture" type="file"/);
  assert.match(room,/id="changeRoomPictureBtn"/);
  assert.match(room,/id="removeRoomPictureBtn"/);
  assert.match(room,/sb\.rpc\('room_update_picture'/);
  assert.match(room,/Only the Room creator can change this Room picture/);
  assert.match(room,/sb\.storage\.from\('room-media'\)\.upload/);
  assert.match(room,/sb\.storage\.from\('room-media'\)\.remove/);
});


test('Room picture update is server-authoritative for the creator',()=>{
  assert.match(migration,/create or replace function public\.room_update_picture/);
  assert.match(migration,/owner_id = auth\.uid\(\)/);
  assert.match(migration,/grant execute on function public\.room_update_picture\(uuid,text\) to authenticated/);
});
