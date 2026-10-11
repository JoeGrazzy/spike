import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const html=fs.readFileSync(path.join(root,'message.html'),'utf8');
const js=fs.readFileSync(path.join(root,'js/spike-dm-realtime-calls-v1.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261011140000_spike_dm_realtime_calls_v1.sql'),'utf8');
test('message page keeps existing ringtone assets and call preferences',()=>{
 assert.match(html,/assets\/mp3\/incoming\.mp3/);assert.match(html,/assets\/mp3\/outgoing\.mp3/);
 assert.match(js,/incoming_call_tone,outgoing_call_tone/);assert.match(js,/incomingTone/);assert.match(js,/outgoingTone/);
});
test('message page wires voice/video controls and accessible call overlay',()=>{
 for(const id of ['voiceCall','videoCall','callShade','acceptCall','declineCall','muteCall','cameraCall','endCall','remoteVideo','localVideo'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/js\/spike-dm-realtime-calls-v1\.js/);assert.match(js,/RTCPeerConnection/);assert.match(js,/getUserMedia/);
});
test('typing and call signaling use a private pair channel and migration authorizes only participants',()=>{
 assert.match(js,/config:\{private:true/);assert.match(js,/event:'typing'/);assert.match(js,/event:'call_signal'/);
 assert.match(migration,/on realtime\.messages for select to authenticated/i);assert.match(migration,/on realtime\.messages for insert to authenticated/i);
 assert.match(migration,/split_part\(topic, ':', 3\)/);assert.match(migration,/split_part\(topic, ':', 4\)/);
});
test('call controls include decline, mute, camera, connection states, and cleanup',()=>{
 for(const term of ['decline','muteCall','cameraCall','connectionState','getTracks().forEach(t=>t.stop())','pagehide'])assert.ok(js.includes(term),`Missing ${term}`);
});

test('call UI honors hidden state so inactive actions never appear as duplicate controls',()=>{
 assert.match(html,/\.callBtn\[hidden\][^}]*display:none!important/);
 assert.match(html,/\.callAvatar\[hidden\][^}]*display:none!important/);
 assert.match(html,/\.callVideos\[hidden\][^}]*display:none!important/);
});
