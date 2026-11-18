import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const message = fs.readFileSync(path.join(root, 'message.html'), 'utf8');

test('direct voice/video calling remains separate from the messaging voice-note feature', () => {
  for (const retired of ['video_call.html', 'js/video-call.js', 'css/video-call.css']) {
    assert.equal(fs.existsSync(path.join(root, retired)), false, `${retired} must remain retired`);
  }
  assert.doesNotMatch(message, /RTCPeerConnection|navigator\.mediaDevices\.getDisplayMedia/i);
  assert.match(message, /id="spikeVoiceCall"/);
  assert.match(message, /id="spikeVideoCall"/);
  assert.match(message, /id="voiceNote"/);
  assert.match(message, /new MediaRecorder\(/);
});

test('voice-note upload uses the private message media bucket and stores a path on the message', () => {
  assert.match(message, /MEDIA_BUCKET=['"]private-message-media['"]/);
  assert.match(message, /db\.storage\.from\(MEDIA_BUCKET\)\.upload\(path,blob/);
  assert.match(message, /message_type:'voice',attachment/);
  assert.match(message, /createSignedUrl\(path,3600\)/);
});

test('voice-note playback resolves a private signed URL and retains a compact player', () => {
  assert.match(message, /class="spikeVoicePlayer"/);
  assert.match(message, /data-voice-path=/);
  assert.match(message, /audio\.src=data\.signedUrl/);
  assert.match(message, /audio\.play\(\)/);
  assert.match(message, /audio\.dataset\.failed='1'/);
});
