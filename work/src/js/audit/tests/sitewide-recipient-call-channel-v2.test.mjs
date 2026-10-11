import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const source=fs.readFileSync(path.join(root,'js/spike-dm-realtime-calls-v2.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261011190000_spike_recipient_call_channels_v2.sql'),'utf8');
test('incoming calls subscribe to one user-specific topic without querying DM history',()=>{
 assert.match(source,/function callTopic\(recipient\)\{return 'spike:call:'\+String\(recipient\)\}/);
 const body=source.slice(source.indexOf('async function topicForMe()'),source.indexOf('async function setupPeer()'));
 assert.match(body,/callTopic\(me\.id\)/);
 assert.match(body,/subscribeCallTopic\(topic,handleSignal,'Incoming-call'\)/);
 const subscription=source.slice(source.indexOf('async function subscribeCallTopic('),source.indexOf('async function topicForMe()'));
 assert.match(subscription,/\.on\('broadcast',\{event:'call_signal'\}/);
 assert.match(subscription,/await new Promise/);
 assert.doesNotMatch(body,/from\('private_messages'\)/);
});
test('outgoing signals target recipient topic and preserve recipient validation',()=>{
 assert.match(source,/const ch=await getPeerChannel\(to\)/);
 assert.match(source,/payload:\{\.\.\.payload,from:me\.id,to\}/);
 assert.match(source,/if\(!me\|\|!uuidRE\.test\(String\(to\|\|''\)\)\)return/);
});
test('database migration authorizes only recipient topic and DM participants can signal',()=>{
 assert.match(migration,/realtime\.topic\(\) = 'spike:call:' \|\| auth\.uid\(\)::text/);
 assert.match(migration,/for insert to authenticated/);
 assert.match(migration,/pm\.sender_id = auth\.uid\(\) and pm\.recipient_id = split_part/);
});
