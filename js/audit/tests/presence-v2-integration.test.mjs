import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL('../../../'+p, import.meta.url), 'utf8');
test('Friends uses the one shared AppPresence service and has no competing fallback channel', async()=>{
 const html=await read('friends.html');
 assert.match(html,/js\/presence\.js\?v=presence-v2-global-20261112/);
 assert.match(html,/AppPresence\?\.start\?\.\(db, user\)/);
 assert.doesNotMatch(html,/friends-app-presence-fallback|spike-app-presence/);
});
test('Room Chat uses the global presence channel and preserves read receipts on its room chat channel', async()=>{
 const html=await read('room_chat.html');
 assert.match(html,/AppPresence\?\.setContext\?\.\(\{room_id:state\.roomId\}\)/);
 assert.match(html,/state\.presence=state\.realtime/);
 assert.match(html,/on\('broadcast',\{event:'read_receipt'\}/);
 assert.doesNotMatch(html,/room-presence-/);
 assert.match(html,/AppPresence\?\.isOnline\?\.\(userId\)/);
});
test('Inbox has one presence runtime and watches visible conversation peers', async()=>{
 const html=await read('messages.html');
 assert.match(html,/AppPresence\?\.watch\?\.\(list\.map\(r=>r\.other\)\)/);
 assert.match(html,/js\/presence\.js\?v=presence-v2-global-20261112/);
 assert.doesNotMatch(html,/presence-timestamps\.js/);
});
test('all pages that previously loaded presence now use the same cache version', async()=>{
 const pages=['admin.html','feed.html','friends.html','guide.html','help.html','index.html','legal.html','message.html','messages.html','notifications.html','policy.html','policy_appeals.html','profile.html','reset-password.html','room.html','room_chat.html','rooms.html','settings.html','share.html','spike-tools.html','view_user.html','followers.html','following.html','mutuals.html'];
 for(const page of pages){const html=await read(page);if(html.includes('presence.js'))assert.match(html,/presence\.js\?v=presence-v2-global-20261112/,`${page} uses an old presence cache key`);}
});
test('DM call bootstrap delegates privacy and lifecycle to Presence V2', async()=>{
 const calls=await read('js/spike-dm-realtime-calls-v2.js');
 const start=calls.slice(calls.indexOf('async function startPresence()'),calls.indexOf('async function activateSession'));
 assert.match(start,/AppPresence\.start\(db\)/);
 assert.doesNotMatch(start,/from\('profile_privacy'\)/);
 assert.doesNotMatch(calls,/new MutationObserver\(sync\)/);
 assert.match(calls,/AppPresence\?\.stop\?\.\(true\)/);
});
test('explicit sign-out paths forcefully stop the authoritative presence session', async()=>{
 const profile=await read('js/profile-page.js');
 const settings=await read('settings.html');
 const feed=await read('js/feed-runtime-04-3.js');
 assert.match(profile,/signOutBtn[\s\S]*?AppPresence\?\.stop\?\.\(true\)/);
 assert.match(settings,/signout'\)\.onclick[\s\S]*?AppPresence\?\.stop\?\.\(true\)/);
 assert.match(feed,/cleanupFeedRuntime[\s\S]*?AppPresence\?\.stop\?\.\(true\)/);
});
test('Feed has no second presence heartbeat timer or legacy presence patch', async()=>{
 const feedRuntime=await read('js/feed-runtime-03.js');
 const cleanup=await read('js/feed-runtime-04-3.js');
 assert.doesNotMatch(feedRuntime,/Presence heartbeat|AppPresence\?\.heartbeat|SPIKEPresencePatch|setInterval\(send,\s*INTERVAL\)/);
 assert.doesNotMatch(cleanup,/SPIKEPresencePatch/);
});

test('global online-arrival notices are not restricted to page-specific watched lists', async()=>{
 const source=await read('js/presence.js');
 const singleton=await read('js/supabase-singleton.js');
 assert.match(singleton,/attachPresence\(singleton\)/);
 assert.match(singleton,/window\.AppPresence\?\.attach\?\.\(client\)/);
 assert.match(source,/if\(!knownOnline\.has\(id\)\)\{knownOnline\.add\(id\);announce\(id\);\}/);
 assert.doesNotMatch(source,/if\(watched\.has\(id\)\)announce\(id\)/);
 assert.match(source,/function attach\(client\)/);
 assert.match(source,/client\.auth\.onAuthStateChange/);
 assert.match(source,/window\.AppPresence=\{version:2,start,stop,attach,/);
});
test('every presence-enabled HTML page includes the shared Supabase singleton bootstrap', async()=>{
 const pages=['admin.html','feed.html','friends.html','guide.html','help.html','index.html','legal.html','message.html','messages.html','notifications.html','policy.html','policy_appeals.html','profile.html','reset-password.html','room.html','room_chat.html','rooms.html','settings.html','share.html','spike-tools.html','view_user.html','followers.html','following.html','mutuals.html'];
 for(const page of pages){const html=await read(page);assert.match(html,/js\/presence\.js\?v=presence-v2-global-20261112/,page+' must load Presence V2');assert.match(html,/js\/supabase-singleton\.js/,page+' must auto-attach Presence V2 to the shared client');}
});

test('Policy page uses the shared authenticated session so global presence can run there too', async()=>{
 const html=await read('policy.html');
 assert.doesNotMatch(html,/persistSession:false/);
 assert.match(html,/persistSession:true/);
});
