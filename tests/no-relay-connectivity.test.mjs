import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = async (path) => readFile(new URL(path, root), 'utf8');
const protocolPrefix = String.fromCharCode(116, 117, 114, 110);
const forbiddenProtocol = new RegExp(`${protocolPrefix}s?:`, 'i');
const forbiddenNames = [
  ['SPIKE_', 'T', 'U', 'R', 'N'].join(''),
  ['SPIKE_CALL_', 'T', 'U', 'R', 'N', '_SERVERS'].join('')
];
const retiredFunctionSlug = ['spike-call', 'ice-config'].join('-');

test('DM voice/video calls use fixed STUN servers and reject relay candidates', async () => {
  const code = await source('js/spike-dm-realtime-calls-v2.js');
  assert.match(code, /stun:stun\.l\.google\.com:19302/);
  assert.match(code, /stun:stun\.cloudflare\.com:3478/);
  assert.match(code, /iceTransportPolicy:'all'/);
  assert.match(code, /function isDirectIceCandidate/);
  assert.match(code, /function directSessionDescription/);
  assert.doesNotMatch(code, forbiddenProtocol);
  for (const name of forbiddenNames) assert.ok(!code.includes(name));
  assert.ok(!code.includes('functions.invoke') && !code.includes(retiredFunctionSlug));
});

test('room audio peer connections use STUN only and reject relay candidates', async () => {
  for (const path of ['js/spike-rooms-v1.js', 'js/spike-room-audio-v1.js']) {
    const code = await source(path);
    assert.match(code, /stun:stun\.l\.google\.com:19302/);
    assert.match(code, /stun:stun\.cloudflare\.com:3478/);
    assert.match(code, /iceTransportPolicy:'all'/);
    assert.match(code, /isDirect(?:Room)?IceCandidate/);
    assert.match(code, /direct(?:Room)?Description/);
    assert.doesNotMatch(code, forbiddenProtocol);
  }
});

test('retired ICE configuration endpoint cannot issue server configuration', async () => {
  const code = await source('supabase/functions/spike-call-ice-config/index.ts');
  assert.match(code, /status:\s*410/);
  assert.doesNotMatch(code, new RegExp(`${forbiddenNames[0]}|makeTurnServers|iceServers|credential`, 'i'));
});

test('outgoing DM call interface appears before mobile media permission resolves', async () => {
  const code = await source('js/spike-dm-realtime-calls-v2.js');
  const start = code.slice(code.indexOf('async function startCall('), code.indexOf('async function receiveOffer('));
  const permission = start.indexOf('await setupPeer()');
  const show = start.indexOf('showCall()');
  const ring = start.indexOf("tone('outgoingTone'");
  const offer = start.indexOf("type:'offer'");
  assert.ok(show >= 0 && permission > show,
    'caller interface must render before requesting microphone/camera permission');
  assert.ok(ring > permission && offer > permission,
    'ringing and signaling must still wait until media permission succeeds');
  assert.match(start, /Preparing call…/);
  assert.match(start, /await endCall\(false\)/, 'permission failure must not signal a phantom hangup');
});

test('shared call interface mounts and binds before auth or Realtime initialization', async () => {
  const code = await source('js/spike-dm-realtime-calls-v2.js');
  const init = code.slice(code.indexOf('async function init(){'), code.indexOf("if(document.readyState==='loading')"));
  assert.ok(init.indexOf('ensureCallUI();bindCallUI()') < init.indexOf('db=window.SPIKE_PLATFORM'),
    'call UI must mount before resolving the Supabase client/session');
});

test('DM call buttons are bound even when a conversation target is invalid', async () => {
  const code = await source('js/spike-dm-realtime-calls-v2.js');
  const connect = code.slice(code.indexOf('async function connectDM(){'), code.indexOf('async function unlockCallPlayback('));
  assert.match(connect, /addEventListener\('click',\(\)=>startCall\('voice'\)\)/);
  assert.match(connect, /addEventListener\('click',\(\)=>startCall\('video'\)\)/);
  assert.ok(connect.indexOf('addEventListener') > connect.indexOf('if(uuidRE.test(other)'),
    'recipient validation must not short-circuit call button binding');
});


test('outgoing call signaling uses private HTTP Broadcast without joining the recipient inbox', async () => {
  const code = await source('js/spike-dm-realtime-calls-v2.js');
  const getChannel = code.slice(code.indexOf('async function getPeerChannel('), code.indexOf('async function sendSignal('));
  assert.match(getChannel, /db\.channel\(key,\{config:\{private:true,broadcast:\{ack:true,self:false\}\}\}\)/);
  assert.doesNotMatch(getChannel, /subscribeCallTopic|\.subscribe\(/);
  assert.match(code, /This is intentional: the sender must not join the recipient's private inbox channel/);
  assert.match(code, /const result=await ch\.send\(/);
  assert.match(code, /result!=='ok'/);
});

test('DM call controls bind before incoming-call Realtime subscription can fail', async () => {
  const code = await source('js/spike-dm-realtime-calls-v2.js');
  const activate = code.slice(code.indexOf('async function activateSession('), code.indexOf('async function deactivateSession('));
  assert.ok(activate.indexOf('await connectDM()') < activate.indexOf('callChannels=await topicForMe()'));
  assert.match(activate, /try\{callChannels=await topicForMe\(\)\}catch\(e\)/);
});

test('call URLs cannot auto-start a call without a fresh user gesture', async () => {
  const code = await source('js/spike-dm-realtime-calls-v2.js');
  assert.match(code, /URL parameters never auto-start a call/);
  assert.doesNotMatch(code, /SPIKE_AUTO_CALL_STARTED|setTimeout\(\(\)=>startCall\(intent/);
  const feed = await source('js/feed-runtime-04-3.js');
  assert.doesNotMatch(feed, /&call=audio|&call=video/);
});
