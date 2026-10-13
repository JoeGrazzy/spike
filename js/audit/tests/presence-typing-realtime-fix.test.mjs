import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const inbox=await readFile('messages.html','utf8');
const dm=await readFile('message.html','utf8');
const presence=await readFile('js/presence.js','utf8');
const calls=await readFile('js/spike-dm-realtime-calls-v2.js','utf8');
const policies=await readFile('supabase/migrations/20261013160000_spike_global_presence_channel_auth_v1.sql','utf8');
test('all DM typing publishers and subscribers use the authorized v1 topic',()=>{
 assert.match(inbox,/const topic='spike:dm-typing:v1:'\+pair\.join\(':'\)/);
 assert.match(dm,/const typingTopic='spike:dm-typing:v1:'/);
 assert.match(calls,/const topic='spike:dm-typing:v1:'/);
});
test('presence uses an authenticated private channel with matching select and insert policies',()=>{
 assert.match(presence,/channel=sb\.channel\(CHANNEL_NAME,\{config:\{private:true,presence:/);
 assert.match(policies,/for select to authenticated[\s\S]*topic = 'spike-global-presence'/);
 assert.match(policies,/for insert to authenticated[\s\S]*topic = 'spike-global-presence'/);
});
test('DM page starts after shared presence script can load and reports realtime failures',()=>{
 assert.match(dm,/window\.addEventListener\('load',init,\{once:true\}\)/);
 assert.match(dm,/Live message connection interrupted/);
});

test('presence retries a broken channel on reconnect/visibility and DM screen displays contact presence',()=>{
 assert.match(presence,/channel\.state!=='joined'\)scheduleReconnect\(sb\)/);
 assert.match(presence,/addEventListener\('pageshow'/);
 assert.match(dm,/id=\"dmPresenceWrap\" data-presence-user/);
 assert.match(dm,/AppPresence\?\.watch\?\.\(\[other\]\)/);
});
test('DM typing waits for subscription, preserves other input listeners, and normalizes participant IDs',()=>{
 assert.match(dm,/typingChannelReady=true/);
 assert.match(dm,/typingPending!==null/);
 assert.doesNotMatch(dm,/event\.stopImmediatePropagation\(\)/);
 assert.match(dm,/map\(x=>String\(x\)\.toLowerCase\(\)\)\.sort\(\)\.join\(':'\)/);
});
