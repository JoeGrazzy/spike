import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const js=fs.readFileSync(path.join(process.cwd(),'js/spike-dm-realtime-calls-v2.js'),'utf8');
test('voice and video recordings require explicit consent from both participants',()=>{
  assert.match(js,/id="recordConsent"/);
  assert.match(js,/id="recordDecline"/);
  assert.match(js,/localConsent:false,remoteConsent:false/);
  assert.match(js,/type:'recording-consent',consent:true/);
  assert.match(js,/type:'recording-consent',consent:false/);
  assert.match(js,/c\.localConsent&&c\.remoteConsent/);
  assert.match(js,/Recording declined\. This call will not be recorded\./);
});
test('recording mixes both participants audio and includes video for video calls',()=>{
  assert.match(js,/new window\.AudioContext|new \(window\.AudioContext\|\|window\.webkitAudioContext\)/);
  assert.match(js,/localTracks/);
  assert.match(js,/remoteTracks/);
  assert.match(js,/createMediaStreamDestination/);
  assert.match(js,/canvas\.captureStream\(24\)/);
  assert.match(js,/new MediaRecorder\(stream/);
});
test('recordings can be stopped, automatically downloaded, and manually saved to device',()=>{
  assert.match(js,/type:'recording-stop'/);
  assert.match(js,/recorder\.ondataavailable/);
  assert.match(js,/recorder\.onstop/);
  assert.match(js,/triggerRecordingDownload/);
  assert.match(js,/id="saveCallRecording"/);
  assert.match(js,/id="closeRecordingResult"/);
});
