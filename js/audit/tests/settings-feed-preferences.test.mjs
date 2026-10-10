import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const settings=await readFile('settings.html','utf8');
const feedRuntime=await readFile('js/feed-runtime-04-2.js','utf8');
test('Settings exposes the Feed preferences that the Feed runtime actually consumes',()=>{
  for(const id of ['feedSensitive','feedSpoilers','feedPolitical','feedFollowingOnly','feedMutedKeywords']) assert.match(settings,new RegExp(`id=["']${id}["']`));
  assert.match(settings,/users\/\$\{uid\}\/settings\/feed/);
  assert.match(settings,/app_documents/);
  assert.match(settings,/show_sensitive/);assert.match(settings,/show_spoilers/);assert.match(settings,/show_political/);assert.match(settings,/following_only/);assert.match(settings,/muted_keywords/);
});
test('Feed consumes the same persisted Feed preference keys exposed by Settings',()=>{
  for(const key of ['show_sensitive','show_spoilers','show_political','following_only','muted_keywords']) assert.match(feedRuntime,new RegExp(`prefs\\.${key}|prefs\\['${key}'\\]`));
  assert.match(feedRuntime,/getDoc\(`users\/\$\{state\.user\.id\}\/settings\/feed`/);
});
test('Settings reports Feed preference persistence failures instead of claiming full success',()=>{
  assert.match(settings,/if\(fr\.error\)failures\.push\('Feed preferences'\)/);
  assert.match(settings,/if\(!fr\.error\)succeeded\.push\('Feed preferences'\)/);
});
