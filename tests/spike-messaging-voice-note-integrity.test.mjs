import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const message = fs.readFileSync(path.join(root, 'message.html'), 'utf8');
const status = fs.readFileSync(path.join(root, 'BACKEND_STATUS.md'), 'utf8');

test('voice and video calling remain absent from the partial backend handoff', () => {
  for (const retired of ['video_call.html', 'js/video-call.js', 'css/video-call.css']) {
    assert.equal(fs.existsSync(path.join(root, retired)), false, `${retired} must remain retired`);
  }
  assert.doesNotMatch(message, /RTCPeerConnection|navigator\.mediaDevices\.getDisplayMedia|id="spikeVoiceCall"|id="spikeVideoCall"/i);
});

test('unsupported voice-note recording controls are not exposed; audio attachments remain supported', () => {
  assert.doesNotMatch(message, /id="voiceNote"|id="recordingTray"|id="sendRecording"/);
  assert.match(fs.readFileSync(path.join(root, 'js/spike-media-routing.js'), 'utf8'), /audio\//);
  assert.match(status, /partial Supabase integration handoff/i);
  assert.match(status, /synchronized messaging/i);
});

test('handoff excludes retired provider credentials while Help Centre uses the current support contact', () => {
  const help = fs.readFileSync(path.join(root, 'help.html'), 'utf8');
  const share = fs.readFileSync(path.join(root, 'share.html'), 'utf8');
  assert.match(help, /wa\.me\/2349159096952/);
  assert.doesNotMatch(help, /Spike@gmail10p\.com|spike\.mediachat\.workers\.dev/i);
  assert.doesNotMatch(share, /2349159096952|Spike@gmail10p\.com|spike\.mediachat\.workers\.dev/i);
  assert.match(fs.readFileSync(path.join(root, 'NEW_OWNER_README.md'), 'utf8'), /new owner/i);
});
