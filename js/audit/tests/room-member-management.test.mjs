import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const read=f=>readFile(path.join(root,f),'utf8');

test('Room member management has one simple member workspace', async()=>{
  const html=await read('room.html');
  assert.match(html,/id="memberSearch"/);
  assert.match(html,/id="memberFilter"/);
  assert.match(html,/id="memberRankings"/);
  assert.match(html,/id="memberDrawer"/);
  assert.match(html,/room_members_list/);
  assert.match(html,/room_member_rankings/);
  assert.match(html,/room_member_history/);
  assert.match(html,/room_member_set_role/);
  assert.match(html,/room_moderation_mute/);
  assert.match(html,/room_moderation_unmute/);
  assert.match(html,/room_moderation_remove/);
  assert.match(html,/room_moderation_ban/);
});

test('Room member management uses server-authoritative ranking and role controls', async()=>{
  const migration=await read('supabase/migrations/20261006152000_room_member_management.sql');
  assert.match(migration,/security definer/);
  assert.match(migration,/room_staff\(p_room_id\)/);
  assert.match(migration,/room_message_reactions/);
  assert.match(migration,/active_days_30d/);
  assert.match(migration,/room_member_set_role/);
  assert.match(migration,/p_role not in \('member','moderator'\)/);
  assert.match(migration,/room_moderation_actions/);
  assert.match(migration,/room_member_history/);
  assert.match(migration,/room_member_rankings/);
});

test('Member actions protect the room owner', async()=>{
  const html=await read('room.html');
  assert.match(html,/The room owner cannot be removed/);
  assert.match(html,/The room owner cannot be banned/);
  const migration=await read('supabase/migrations/20261006152000_room_member_management.sql');
  assert.match(migration,/The room owner role cannot be changed here/);
});

test('Moderation RPCs enforce staff hierarchy server-side', async()=>{
  const migration=await read('supabase/migrations/20261006153200_harden_room_member_moderation_hierarchy.sql');
  assert.match(migration,/room owner cannot be muted/);
  assert.match(migration,/room owner cannot be removed/);
  assert.match(migration,/room owner cannot be banned/);
  assert.match(migration,/actor_role='moderator'/);
  assert.match(migration,/cannot moderate another staff member/);
});
