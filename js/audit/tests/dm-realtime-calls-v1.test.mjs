import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const html=fs.readFileSync(path.join(root,'message.html'),'utf8');
const js=fs.readFileSync(path.join(root,'js/spike-dm-realtime-calls-v2.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261011140000_spike_dm_realtime_calls_v1.sql'),'utf8');
const sitewideMigration=fs.readFileSync(path.join(root,'supabase/migrations/20261011171500_spike_sitewide_call_presence_v2.sql'),'utf8');
test('message page keeps existing ringtone assets and call preferences',()=>{
 assert.match(js,/assets\/mp3\/incoming\.mp3/);assert.match(js,/assets\/mp3\/outgoing\.mp3/);
 assert.match(js,/incoming_call_tone,outgoing_call_tone/);assert.match(js,/incomingTone/);assert.match(js,/outgoingTone/);
});
test('message page wires voice/video controls and accessible call overlay',()=>{
 for(const id of ['voiceCall','videoCall'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(js,/wrap\.id='callShade'/);for(const id of ['acceptCall','declineCall','muteCall','cameraCall','endCall','remoteVideo','localVideo'])assert.ok(js.includes(`id=\"${id}\"`)||js.includes(`id="${id}"`),`Missing runtime UI id ${id}`);
 assert.match(html,/js\/spike-dm-realtime-calls-v2\.js/);assert.doesNotMatch(html,/spike-dm-realtime-calls-v1\.js/);assert.match(js,/RTCPeerConnection/);assert.match(js,/getUserMedia/);
});

test('call controls include decline, mute, camera, connection states, and cleanup',()=>{
 for(const term of ['decline','muteCall','cameraCall','connectionState','getTracks().forEach(t=>t.stop())','pagehide'])assert.ok(js.includes(term),`Missing ${term}`);
});

test('call UI honors hidden state so inactive actions never appear as duplicate controls',()=>{
 assert.match(js,/button\[hidden\][^}]*display:none!important/);
 assert.match(js,/spike-global-call-card \[hidden\]\{display:none!important\}/);
 assert.match(js,/id="recordVoice"/);assert.match(js,/id="recordVideo"/);assert.match(js,/id="recordBusiness"/);
});

test('site-wide call receiver and shared presence are loaded on every SPIKE page',()=>{
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){const page=fs.readFileSync(path.join(root,file),'utf8');assert.match(page,/js\/spike-dm-realtime-calls-v2\.js/,`${file} must load global call receiver`);assert.match(page,/js\/presence\.js/,`${file} must load shared presence`)}
 assert.match(js,/AppPresence\.start/);assert.doesNotMatch(js,/from\('profile_privacy'\)/);
});
