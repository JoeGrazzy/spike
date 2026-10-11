import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const read=f=>readFile(path.join(root,f),'utf8');

test('Rooms has one simple directory surface', async()=>{
  const s=await read('rooms.html');
  assert.doesNotMatch(s,/class="roomTabs[^>]*"|id="roomTabs"/);
  assert.doesNotMatch(s,/data-tab="(discover|joined|mine|creator)"/);
  assert.doesNotMatch(s,/aria-label="Trending rooms"|id="trendStrip"/);
  assert.match(s,/id="search"/);
  assert.match(s,/id="rooms"/);
  assert.match(s,/id="creatorAction"/);
  assert.match(s,/Room profile optional/);
  assert.doesNotMatch(s,/Create your Room Account first/);
});

test('Room chat exposes only conversation controls at the surface', async()=>{
  const s=await read('room_chat.html');
  for (const token of ['momentBtn','walletBtn','gemsBtn','fontBtn','SPIKE_ROOM_FEATURES','menuWallet','menuGems','menuMoment','menuAI','menuContributors']) assert.doesNotMatch(s,new RegExp(token));
  for (const token of ['menuSearch','menuMembers','menuChannels','menuRules','menuShare','menuModeration','menuRoom']) assert.match(s,new RegExp(token));
  assert.match(s,/room_public_send_message/);
  assert.match(s,/room_moderation_set_slow_mode/);
  assert.match(s,/room_moderation_lock_chat/);
  assert.doesNotMatch(s,/Create your Room Account in Rooms before joining this room/);
});

test('Rooms keeps the canonical member path and no duplicate chat entrypoint', async()=>{
  const rooms=await read('rooms.html');
  const chat=await read('room_chat.html');
  assert.match(rooms,/room_chat\.html/);
  assert.match(chat,/location\.replace\('rooms\.html'/);
  await assert.rejects(access(path.join(root,'chat_room.html')));
});
