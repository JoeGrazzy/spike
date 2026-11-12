import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const source = await readFile(new URL('../../presence.js', import.meta.url), 'utf8');
const root = new URL('../../../', import.meta.url);
test('Presence V2 owns one heartbeat, one lookup lifecycle and reconnect cleanup', () => {
  assert.match(source, /const CHANNEL='spike-global-presence'/);
  assert.match(source, /setInterval\(\(\)=>track\(true\),HEARTBEAT\)/);
  assert.match(source, /setInterval\(lookup,LOOKUP\)/);
  assert.match(source, /async function disconnect\(/);
  assert.match(source, /scheduleReconnect\(\)/);
  assert.match(source, /run!==generation/);
  assert.match(source, /addEventListener\('pagehide'/);
});
test('Presence V2 persists server-confirmed timestamps and reads privacy-filtered last seen', () => {
  assert.match(source, /touch_user_presence/);
  assert.match(source, /spike_get_user_presence/);
  assert.match(source, /p_current_page:location\.pathname/);
  assert.match(source, /if\(status!==\'ok\'\)throw new Error\('Realtime presence track/);
  assert.match(source, /setInterval\(lookup,LOOKUP\)/);
});
test('Presence V2 owns the public API and smart online-arrival notice', () => {
  assert.match(source, /window\.AppPresence=\{version:2,start,stop,attach,heartbeat:\(\)=>track\(true\),watch,subscribe,isOnline,getState,isPublishing,setContext,getOnlineIds,getRoomOnlineCount\}/);
  assert.match(source, /async function announce\(id\)/);
  assert.match(source, /POPUP_MS=2500/);
  assert.match(source, /DEDUPE_MS=60000/);
  assert.match(source, /initialSync/);
});
test('smart online notification is top-safe-area positioned and renders the real profile avatar', () => {
  assert.match(source, /top:calc\(env\(safe-area-inset-top,0px\) \+ 12px\)/);
  assert.doesNotMatch(source, /\.spike-presence-toast\{[^}]*bottom:/);
  assert.match(source, /avatar_url/);
  assert.match(source, /db\.rpc\('get_public_profiles'/);
  assert.match(source, /db\.rpc\('get_registered_users_public'/);
  assert.match(source, /SPIKE_IDENTITY\?\.imageOf/);
  assert.match(source, /img\.isConnected&&avatar\.contains\(img\)/);
  assert.match(source, /height:28px!important/);
  assert.match(source, /width:min\(300px,calc\(100vw - 32px\)\)/);
  assert.match(source, /spike-presence-toast-avatar/);
});
test('retired independent timestamp runtime is absent', async () => {
  await assert.rejects(access(new URL('../../presence-timestamps.js', import.meta.url)), { code: 'ENOENT' });
});
