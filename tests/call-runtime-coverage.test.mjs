import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL('../' + name, import.meta.url), 'utf8');

const activeSurfaces = [
  'admin.html', 'feed.html', 'followers.html', 'friends.html', 'help.html',
  'index.html', 'legal-center.html', 'message.html', 'messages.html',
  'notifications.html', 'policy.html', 'profile.html', 'referrals.html',
  'reset-password.html', 'room-diagnostics.html', 'room.html', 'rooms.html',
  'settings.html', 'share.html', 'spike-tools.html', 'user-profile.html', 'wallet.html'
];

test('incoming call runtime is loaded on every active SPIKE surface', async () => {
  for (const page of activeSurfaces) {
    const html = await read(page);
    assert.match(html, /spike-dm-realtime-calls-v2\.js\?v=sitewide-calls-v2[34]/, `${page} must load the global incoming-call receiver`);
  }
});

test('help surface loads Supabase before the global incoming-call receiver', async () => {
  const html = await read('help.html');
  assert.ok(html.indexOf('supabase.min.js') < html.indexOf('spike-dm-realtime-calls-v2.js'));
  assert.ok(html.indexOf('supabase-singleton.js') < html.indexOf('spike-platform-core-v1.js'));
  assert.ok(html.indexOf('spike-platform-core-v1.js') < html.indexOf('spike-dm-realtime-calls-v2.js'));
});

test('newly covered authenticated pages initialize Supabase before the call receiver', async () => {
  for (const page of ['admin.html', 'help.html', 'room-diagnostics.html']) {
    const html = await read(page);
    assert.ok(html.indexOf('supabase-singleton.js') < html.indexOf('spike-platform-core-v1.js'), `${page}: singleton must load before platform core`);
    assert.ok(html.indexOf('spike-platform-core-v1.js') < html.indexOf('spike-dm-realtime-calls-v2.js'), `${page}: platform core must load before call receiver`);
  }
});

test('shared call interface exposes the incoming, outgoing, and active call controls', async () => {
  const code = await read('js/spike-dm-realtime-calls-v2.js');
  assert.match(code, /wrap\.id='callShade'/);
  for (const id of ['acceptCall', 'declineCall', 'endCall', 'muteCall', 'cameraCall', 'flipCameraCall', 'speakerCall', 'remoteAudio', 'remoteVideo', 'localVideo']) {
    assert.ok(code.includes(`id="${id}"`), `missing call UI element: ${id}`);
  }
  assert.match(code, /async function receiveOffer\(/);
  assert.match(code, /async function startCall\(/);
  assert.match(code, /async function acceptCall\(/);
});
