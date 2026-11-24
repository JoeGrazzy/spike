import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const messaging = fs.readFileSync(new URL('../js/spike-messages.js', import.meta.url), 'utf8');
const calls = fs.readFileSync(new URL('../js/spike-call-engine.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
const dmMigration = fs.readFileSync(new URL('../supabase/migrations/20261123234241_spike_realtime_private_topic_hardening_v1.sql', import.meta.url), 'utf8');
const callSchema = fs.readFileSync(new URL('../supabase/migrations/20261123230328_spike_one_to_one_call_sessions_v1.sql', import.meta.url), 'utf8');
const realtimeSeparation = fs.readFileSync(new URL('../supabase/migrations/20261124044627_spike_realtime_postgres_changes_channel_separation_v1.sql', import.meta.url), 'utf8');
const profileRuntime = fs.readFileSync(new URL('../js/spike-profile-runtime.js', import.meta.url), 'utf8');
const profileHtml = fs.readFileSync(new URL('../profile.html', import.meta.url), 'utf8');

test('one-to-one conversation resolves the call recipient ID', () => {
  assert.match(messaging, /currentPeerId\s*=\s*!isGroup\s*&&\s*peerId\s*\?\s*String\(peerId\)\s*:\s*null/);
  assert.match(messaging, /getCallContext:\s*\(\)\s*=>\s*\(\{\s*conversationId,\s*peerId:\s*currentPeerId,\s*isGroup:\s*currentConversationIsGroup\s*\}\)/);
});

test('group conversations do not expose a call recipient', () => {
  assert.match(messaging, /currentPeerId\s*=\s*!isGroup\s*&&\s*peerId/);
});

test('calls fetch secure Metered TURN ICE servers through Supabase and retain STUN fallback', () => {
  assert.match(calls, /stun:stun\.relay\.metered\.ca:80/);
  assert.match(calls, /async function loadIceServers\(\)/);
  assert.match(calls, /functions\.invoke\('metered-turn-credentials'/);
  assert.match(calls, /data\?\.iceServers/);
  assert.match(calls, /await loadIceServers\(\)/);
  assert.match(calls, /state\.iceServers = ICE_SERVERS/);
  assert.match(calls, /new RTCPeerConnection\(\{iceServers:state\.iceServers\|\|ICE_SERVERS/);
  assert.doesNotMatch(calls, /METERED_TURN_USERNAME|METERED_TURN_CREDENTIAL|secretKey=|YOUR_METERED_ACCOUNT_SECRET/);
});

test('Worker no longer exposes a TURN credential endpoint', () => {
  assert.doesNotMatch(worker, /call-ice|TURN_KEY|generate-ice-servers/);
});

test('voice and video calls always use a dedicated unmuted remote audio sink', () => {
  assert.match(calls, /id = 'spikeCallRemoteAudio'/);
  assert.match(calls, /audio\.muted = false; audio\.volume = 1/);
  assert.match(calls, /audio\.srcObject=state\.remoteStream/);
  assert.match(calls, /remote\.muted=true/);
  assert.match(calls, /function enableRemoteAudio\(\)/);
  assert.match(calls, /add\('spikeCallEnableSound', 'Enable sound', '', enableRemoteAudio, 'sound'\)/);
});

test('call start and accept prime mobile audio output during the user gesture', () => {
  assert.match(calls, /async function startCall\(type, context\) \{\n    primeAudioOutput\(\)/);
  assert.match(calls, /async function acceptCall\(\) \{\n    primeAudioOutput\(\)/);
  assert.match(calls, /AudioContextCtor/);
  assert.match(calls, /audioPlaybackBlocked/);
});

test('Realtime hardening requires private topics and active call sessions', () => {
  assert.equal((dmMigration.match(/private is true/g) || []).length, 6);
  assert.match(dmMigration, /s\.status in \('ringing','accepted'\)/);
  assert.match(dmMigration, /s\.last_activity_at > now\(\) - interval '4 minutes'/);
});

test('deployment revalidates application code after releases', () => {
  const headers = fs.readFileSync(new URL('../_headers', import.meta.url), 'utf8');
  assert.match(headers, /\/js\/\*\s+Cache-Control: public, max-age=0, must-revalidate/);
  assert.match(headers, /\/css\/\*\s+Cache-Control: public, max-age=0, must-revalidate/);
});

test('Worker configuration has no unused API-first route or TURN secrets', () => {
  const config = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.doesNotMatch(config, /run_worker_first|TURN_KEY|CALL_ICE/);
  assert.doesNotMatch(config, /SUPABASE_ANON_KEY/);
});

test('caller no-answer finalization records a missed call', () => {
  assert.match(calls, /callerMissed=state\.role==='caller' && message==='No answer\.'/);
  assert.match(calls, /rpc\(callerMissed\?'spike_mark_call_missed':'spike_end_call'/);
  assert.match(calls, /sendSignal\(signalEvent/);
});

test('call event Postgres Changes channel relies on participant table RLS, not private Broadcast authorization', () => {
  assert.match(calls, /channel\(`spike-call-events-\$\{userId\}`\)/);
  assert.doesNotMatch(calls, /channel\(`spike-call-events-\$\{userId\}`\s*,\s*\{config:\{private:true\}\}\)/);
  assert.match(callSchema, /SPIKE call participants can read their calls/);
  assert.match(callSchema, /auth\.uid\(\)\) in \(caller_id,callee_id\)/);
  assert.match(realtimeSeparation, /drop policy if exists \"SPIKE call owner can receive private event topic\"/);
});

test('private DM typing remains scoped to conversation members on its own topic', () => {
  assert.match(realtimeSeparation, /spike-dm-typing:/);
  assert.match(realtimeSeparation, /cm\.conversation_id = private\.try_uuid\(substring\(realtime\.topic\(\) from 17\)\)/);
  assert.match(realtimeSeparation, /cm\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(calls, /channel\(`spike-call:\$\{callId\}`,\{config:\{private:true,broadcast:\{ack:true,self:false\}\}\}\)/);
});

test('incoming-call reconciliation runs only after the Realtime channel is subscribed', () => {
  assert.match(calls, /if\(status==='SUBSCRIBED'\)[\s\S]*?void loadPendingCalls\(\)/);
  assert.match(calls, /function loadPendingCalls\(\)/);
  assert.match(calls, /state\.status==='idle' && data\?\.length/);
});

test('incoming-call listener retries failed channels and resumes on connectivity return', () => {
  assert.match(calls, /scheduleEventsReconnect/);
  assert.match(calls, /status==='CHANNEL_ERROR' \|\| status==='TIMED_OUT' \|\| status==='CLOSED'/);
  assert.match(calls, /addEventListener\('online',resumeEvents\)/);
  assert.match(calls, /addEventListener\('visibilitychange',resumeEvents\)/);
});

test('incoming call interface renders before caller profile lookup completes', () => {
  const incoming = calls.slice(calls.indexOf('async function incomingCall'), calls.indexOf('async function joinCallChannel'));
  assert.ok(incoming.indexOf("showUI('incoming',incomingLabel)") < incoming.indexOf('void profileFor('));
});

test('outgoing call interface renders before the create-call RPC and device permissions', () => {
  const outgoing = calls.slice(calls.indexOf('async function startCall'), calls.indexOf('function loadIceServers'));
  assert.ok(outgoing.indexOf("showUI('outgoing','Starting secure call…')") < outgoing.indexOf("rpc('spike_create_call'"));
  assert.ok(outgoing.indexOf("showUI('outgoing','Preparing microphone and camera…')") < outgoing.indexOf('await prepareMedia(attempt)'));
  assert.match(outgoing, /spike_end_call.*late-created row|late-created row/);
});

test('outgoing call UI is rendered before asynchronous auth restoration', () => {
  const outgoing = calls.slice(calls.indexOf('async function startCall'), calls.indexOf('function loadIceServers'));
  assert.ok(outgoing.indexOf("showUI('outgoing','Starting secure call…')") < outgoing.indexOf('await getCurrentUser()'));
  assert.ok(outgoing.indexOf('await getCurrentUser()') < outgoing.indexOf("rpc('spike_create_call'"));
  assert.match(outgoing, /try \{[\s\S]*?await getCurrentUser\(\)/);
});

test('a failed peer connection ends the call instead of leaving it stuck', () => {
  assert.match(calls, /connection==='failed'\)void endCall\('Could not connect directly on this network/);
});

test('call auth listener is attached before initial session lookup and can recover after delayed auth', () => {
  const startup = calls.slice(calls.indexOf('async function start()'), calls.indexOf('window.SPIKE_CALLS='));
  assert.ok(startup.indexOf('db.auth.onAuthStateChange') < startup.indexOf('db.auth.getSession'));
  assert.match(startup, /waiting for auth recovery/);
  assert.match(startup, /if\(!state\.eventsChannel\)void subscribeEvents\(\)/);
});

test('cancelling a call while media permission is pending stops late media tracks', () => {
  assert.match(calls, /if\(state\.callAttempt!==attempt \|\| state\.status==='idle'\)\{\s*stream\.getTracks\(\)\.forEach\(track=>track\.stop\(\)\)/);
  assert.match(calls, /state\.callAttempt\+\+/);
});

test('pending-call recovery polls independently of the Realtime subscription while the app is foregrounded', () => {
  assert.match(calls, /function startPendingCallPolling\(\)/);
  assert.match(calls, /window\.setInterval\(\(\)=>\{\s*if\(state\.user && state\.status==='idle' && !document\.hidden && navigator\.onLine\)void loadPendingCalls\(\);\s*\},6000\)/);
  assert.match(calls, /function stopPendingCallPolling\(\)/);
  assert.match(calls, /startPendingCallPolling\(\);\s*void loadPendingCalls\(\);\s*if\(!state\.eventsChannel\)void subscribeEvents\(\)/);
});

test('caller negotiation is recovered from durable accepted database state', () => {
  assert.match(calls, /row\.status==='accepted' && state\.role==='caller'/);
  assert.match(calls, /state\.peerAccepted=true/);
  assert.match(calls, /if\(state\.peerAccepted\)void beginCallerNegotiation\(\)/);
  assert.match(calls, /if\(state\.role!=='caller' \|\| !state\.peerAccepted \|\| !state\.pc/);
});

test('ICE and offer signalling wait for private channel readiness and check delivery', () => {
  assert.match(calls, /if\(!state\.channelReady\)\{[\s\S]*?state\.queuedSignals\.push/);
  assert.match(calls, /void flushQueuedSignals\(\)/);
  assert.match(calls, /result!=='ok'/);
  assert.match(calls, /if\(!delivered\)throw new Error/);
});


test('incoming offer and ICE candidates are queued until the callee peer connection is ready', () => {
  assert.match(calls, /incomingSignals: \[\], incomingFlushing: false/);
  assert.ok(calls.includes("if(['offer','answer','ice'].includes(signal.event) && (!state.pc || (signal.event==='offer' && state.role==='callee' && state.status!=='joining'))) {\n      state.incomingSignals.push(signal);"));
  assert.match(calls, /async function flushIncomingSignals\(\)[\s\S]*?await handleSignal\(signal\)/);
  assert.match(calls, /\['joining','negotiating'\]\.includes\(state\.status\)/);
  assert.match(calls, /void flushIncomingSignals\(\)/);
  assert.match(calls, /state\.incomingSignals=\[\]/);
});

test('active call signalling channel retries after failure and rejoins on connectivity recovery', () => {
  assert.match(calls, /function scheduleCallChannelReconnect\(generation\)/);
  assert.match(calls, /state\.channelRetryDelay=Math\.min\(15000,Math\.round\(delay\*1\.8\)\)/);
  assert.match(calls, /status==='CHANNEL_ERROR'\|\|status==='TIMED_OUT'\|\|status==='CLOSED'/);
  assert.match(calls, /if\(state\.callId && !state\.channel\)void joinCallChannel\(\)/);
  assert.match(calls, /state\.channelGeneration\+\+/);
});

test('queued call signals remain queued until acknowledged after a channel rejoin', () => {
  assert.match(calls, /while\(state\.channelReady && state\.queuedSignals\.length\)/);
  assert.match(calls, /if\(!sent\)break/);
  assert.match(calls, /state\.channelFlushing=true/);
  assert.match(calls, /state\.channelFlushing=false/);
});

test('call event subscriptions wait for the authenticated Realtime token handoff', () => {
  assert.match(calls, /async function syncRealtimeAuth\(session\)/);
  assert.match(calls, /await client\(\)\.realtime\.setAuth\(session\.access_token\)/);
  assert.match(calls, /syncRealtimeAuth\(session\)\.then\(userId=>/);
  assert.match(calls, /if\(state\.user\?\.id===userId && !state\.eventsChannel\) return subscribeEvents\(\)/);
});

test('private call channel joins and reconnects only after the current account JWT is synchronized', () => {
  assert.match(calls, /async function ensureRealtimeAuth\(\)/);
  assert.match(calls, /await db\.realtime\.setAuth\(session\.access_token\)/);
  assert.match(calls, /if\(expectedUserId && session\.user\.id!==expectedUserId\)/);
  const join = calls.slice(calls.indexOf('async function joinCallChannel'), calls.indexOf('async function sendSignal'));
  assert.ok(join.indexOf('await ensureRealtimeAuth()') < join.indexOf('db.channel(`spike-call:${callId}`'));
  assert.match(join, /state\.channelJoiningCallId===callId/);
  assert.match(join, /state\.callAttempt!==attempt/);
  assert.match(join, /config:\{private:true,broadcast:\{ack:true,self:false\}\}/);
  const start = calls.slice(calls.indexOf('async function startCall'), calls.indexOf('function loadIceServers'));
  assert.ok(start.indexOf('await ensureRealtimeAuth()') < start.indexOf("rpc('spike_create_call'"));
});


test('global hover polish never applies border styling to every hovered element', () => {
  for (const file of ['../css/feed-experience-bundle.css', '../css/spike-beauty.css']) {
    const css = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(css, /(?:^|,)\\s*:hover\\s*(?:,|\\{)/m);
  }
});

const dialog = fs.readFileSync(new URL('../js/spike-dialog.js', import.meta.url), 'utf8');
const conversationHtml = fs.readFileSync(new URL('../message.html', import.meta.url), 'utf8');

test('conversation report and delete actions use dedicated semantic icons', () => {
  assert.match(dialog, /report:'<path/);
  assert.match(dialog, /delete:'<path/);
  assert.match(messaging, /title: 'Report message'[\s\S]*?icon: 'report'/);
  assert.match(messaging, /title: 'Delete this message\?'[\s\S]*?icon: 'delete'/);
});

test('message and attachment sheets give each action its own accessible icon', () => {
  for (const action of ['reply', 'copy', 'share', 'like', 'report', 'delete']) {
    assert.match(conversationHtml, new RegExp(`data-msg-action="${action}"[^>]*><i`));
  }
  for (const kind of ['image', 'video', 'audio', 'pdf', 'archive', 'any']) {
    assert.match(conversationHtml, new RegExp(`data-media-kind="${kind}"[^>]*><i`));
  }
  assert.match(conversationHtml, /fa-flag/);
  assert.match(conversationHtml, /fa-trash-can/);
});


test('profile Friends stat counts mutual friendships and Add remains an action', () => {
  assert.match(profileRuntime, /listMutualFriends\(db\(\),\{limit:2000,offset:0\}\)/);
  assert.match(profileRuntime, /setText\('friendCount'/);
  assert.match(profileRuntime, /kind==='friends'\|\|kind==='add'\)location\.href='friends\.html'/);
  assert.match(profileHtml, /data-stat=\"friends\"[^>]*><b id=\"friendCount\"/);
  assert.match(profileHtml, /data-stat=\"add\"[^>]*><b aria-hidden=\"true\">\+</);
  assert.doesNotMatch(profileHtml, /id=\"followerCount\"|id=\"followingCount\"/);
});


const friendsPage = fs.readFileSync(new URL('../friends.html', import.meta.url), 'utf8');
const friendsController = fs.readFileSync(new URL('../js/spike-friends-controller.js', import.meta.url), 'utf8');

test('Friends discovery uses manual Add friend requests and contains no QR scanner path', () => {
  assert.match(friendsPage, /Find people in Discover and tap Add friend/);
  assert.doesNotMatch(friendsPage, /profile\.html#scan|Scan QR to add|Add friends by scanning/i);
  assert.match(friendsController, /add\.dataset\.action = 'add'/);
  assert.match(friendsController, /sendFriendRequest\(state\.db, userId\)/);
  assert.doesNotMatch(friendsController, /location\.href = 'profile\.html#scan'|Scan QR to add/);
});

test('Manual Add action refreshes requests and mutual-friend state through the shared refresh path', () => {
  assert.match(friendsController, /if \(action === 'add'\)[\s\S]*?sendFriendRequest\(state\.db, userId\)[\s\S]*?await refresh\(\)/);
  assert.match(friendsController, /data-tab="suggestions"|tab === 'suggestions'/);
  assert.match(friendsController, /acceptFriendRequest\(state\.db, userId\)/);
});


test('friend-request notifications use the friend-request preference instead of follow preference', () => {
  const notifications = fs.readFileSync(new URL('../js/spike-notifications.js', import.meta.url), 'utf8');
  assert.match(notifications, /t\.includes\('friend'\)\|\|t\.includes\('request'\)\)return'np_friend_requests';if\(t\.includes\('follow'\)\)return'np_follows'/);
});

const platformBootstrap = fs.readFileSync(new URL('../js/spike-platform-bootstrap.js', import.meta.url), 'utf8');
const androidDeviceMigration = fs.readFileSync(new URL('../supabase/migrations/20261124110714_spike_single_active_android_device_v1.sql', import.meta.url), 'utf8');

test('Android account sessions register one current device and sign out replaced devices locally', () => {
  assert.match(platformBootstrap, /const isAndroidDevice = \/Android\/i\.test\(navigator\.userAgent/);
  assert.match(platformBootstrap, /spike_register_android_device/);
  assert.match(platformBootstrap, /spike_is_current_android_device/);
  assert.match(platformBootstrap, /ANDROID_CHECK_INTERVAL = 20000/);
  assert.match(platformBootstrap, /signOut\(\{ scope: 'local' \}\)/);
  assert.match(platformBootstrap, /Your SPIKE account was opened on another Android device/);
  assert.match(platformBootstrap, /spike\.android\.device-id\.v1/);
});

test('Android device lock is private and only authenticated users can use its RPCs', () => {
  assert.match(androidDeviceMigration, /enable row level security/i);
  assert.match(androidDeviceMigration, /revoke all on table public\.spike_android_device_lock from anon, authenticated/i);
  assert.match(androidDeviceMigration, /revoke all on function public\.spike_register_android_device\(text, text\) from public, anon/i);
  assert.match(androidDeviceMigration, /grant execute on function public\.spike_register_android_device\(text, text\) to authenticated/i);
  assert.match(androidDeviceMigration, /grant execute on function public\.spike_is_current_android_device\(text\) to authenticated/i);
  assert.match(androidDeviceMigration, /auth\.uid\(\)/);
});
