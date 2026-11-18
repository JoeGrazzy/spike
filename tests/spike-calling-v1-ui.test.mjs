import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const message = fs.readFileSync(path.join(root, 'message.html'), 'utf8');
const calling = fs.readFileSync(path.join(root, 'js/spike-calling-v1.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/spike-calling-v1.css'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'js/spike-navigation.js'), 'utf8');

test('DM header exposes separate voice and video call actions', () => {
  assert.match(message, /id="spikeVoiceCall"/);
  assert.match(message, /id="spikeVideoCall"/);
  assert.match(message, /js\/spike-calling-v1\.js/);
});

test('call UI provides incoming, outgoing, media, and hangup controls', () => {
  for (const id of ['spikeCallShade','spikeCallAccept','spikeCallReject','spikeCallHangup','spikeCallMute','spikeCallCamera','spikeCallRemoteVideo','spikeCallLocalVideo']) {
    assert.match(message, new RegExp(`id="${id}"`));
  }
  assert.match(css, /spike-call-shade/);
});

test('calling engine is separate from voice-note recorder and uses Agora RTC', () => {
  assert.match(message, /id="voiceNote"/);
  assert.match(message, /new MediaRecorder\(/);
  assert.doesNotMatch(message, /RTCPeerConnection/);
  assert.match(calling, /AgoraRTC_N-4\.24\.10/);
  assert.match(calling, /spike-call-control/);
  assert.match(calling, /spike-agora-token/);
  assert.match(calling, /spike_mark_call_connected/);
  assert.match(calling, /call\.ringing_expires_at/);
});

test('calling engine uses private per-user Realtime inbox and no client-side invite publishing', () => {
  assert.match(calling, /user:\$\{me\.id\}:calls/);
  assert.match(calling, /private: true/);
  assert.doesNotMatch(calling, /inbox\.send\(/);
  assert.match(navigation, /import\('\.\/spike-calling-v1\.js\?v=calling-v1-agora-20261118'\)/);
});
