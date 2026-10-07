import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const read=f=>readFile(path.join(root,f),'utf8');

test('Room Chat critical flows are wired to real handlers and authoritative data paths', async()=>{
  const html=await read('room_chat.html');
  const migration=await read('supabase/migrations/20261006145600_enforce_room_slow_mode_server_side.sql');

  assert.match(html,/if\(!state\.channel\)\{return\}/,'Realtime subscription must not dereference a missing channel');
  assert.match(html,/const channel=await ensureChannel\(\);[\s\S]*if\(channel&&state\.joined\)\{await fetchMessages\(\);await subscribe\(\);\}/,'Boot must only fetch/subscribe after a real channel exists');
  assert.match(html,/const channel=await ensureChannel\(\);renderComposer\(\);if\(channel\)\{await fetchMessages\(\);await subscribe\(\);toast\('You joined the room\.'\)/,'Join must handle a room with no channel without crashing');
  assert.match(html,/data-search-channel/);
  assert.match(html,/async function focusSearchResult\(id,channelId,createdAt\)/,'Search results must open messages even when they are outside the currently loaded window');
  assert.match(html,/beforeQ=sb\.from\('room_messages'\)[\s\S]*afterQ=sb\.from\('room_messages'\)/,'Search focus must load message context from the server');
  assert.doesNotMatch(html,/const virtual=total>120/,'Message rendering must not hide loaded messages behind a non-reactive virtual window');
  assert.match(html,/return !!ok/,'Moderation confirmation must return a real boolean so Cancel cannot authorize an action');
  assert.match(migration,/slow_mode_seconds/);
  assert.match(migration,/not public\.is_room_staff\(p_room_id\)/);
  assert.match(migration,/max\(rm\.created_at\)/);
  assert.match(migration,/slow mode: please wait before sending another message/);
});
