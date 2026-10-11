import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const js=fs.readFileSync(path.join(process.cwd(),'js/spike-dm-realtime-calls-v2.js'),'utf8');
const html=fs.readFileSync(path.join(process.cwd(),'js/spike-dm-realtime-calls-v2.js'),'utf8');
test('the call UI exposes exactly three distinct recording modes',()=>{
  assert.match(js,/id="recordVoice"/);assert.match(js,/id="recordVideo"/);assert.match(js,/id="recordBusiness"/);
  assert.match(js,/addEventListener\('click',\(\)=>startCallRecording\('voice'\)\)/);
  assert.match(js,/addEventListener\('click',\(\)=>startCallRecording\('video'\)\)/);
  assert.match(js,/addEventListener\('click',requestBusinessRecording\)/);
});
test('voice and video modes mix local and remote audio and disclose recording in-call',()=>{
  assert.match(js,/buildMixedAudio/);assert.match(js,/liveTracks\(c\.local,'audio'\)/);assert.match(js,/liveTracks\(c\.remote,'audio'\)/);
  assert.match(js,/recording-notice/);assert.match(js,/notifyPeerOfRecording/);assert.match(js,/recording-notice-ack/);assert.match(js,/Other participant is recording/);assert.match(js,/#recordingRemoteNotice/);assert.match(js,/A discreet recording indicator is visible to the other participant/);
  assert.match(js,/canvas\.captureStream\(20\)/);assert.match(js,/drawCover\(ctx,localVideo/);assert.match(js,/drawCover\(ctx,remoteVideo/);
});
test('business recording requires both explicit approvals before the initiator starts capture',()=>{
  assert.match(js,/recording-business-request/);assert.match(js,/recording-business-consent/);
  assert.match(js,/!b\.localConsent\|\|!b\.remoteConsent/);assert.match(js,/b\.initiator===me\?\.id/);
  assert.match(js,/Both participants must explicitly approve/);assert.match(js,/recordBusinessApprove/);assert.match(js,/recordBusinessDecline/);
  assert.match(js,/Business recording consent was withdrawn before capture began/);assert.match(js,/participant-withdrew-consent/);
});
test('one recorder per call, unique session state, and cleanup prevent duplicate recording work',()=>{
  assert.match(js,/c\.recordingStarting\|\|c\.recordingStarted\|\|c\.recorder/);
  assert.match(js,/function recordingSessionId\(\)/);assert.match(js,/recordingStopping/);assert.match(js,/const suffix=safeFilePart\(c\.recordingSessionId\|\|'session'\)/);
  assert.match(js,/c\.recordAudioContext\?\.close/);assert.match(js,/c\.recordingStream\?\.getTracks/);
});
