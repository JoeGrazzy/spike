import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('new call runtime is a separate module with voice and video WebRTC handling', () => {
  const js = read('js/spike-calling-v2.js');
  for (const token of ['spike_dm_calls_v2','spike_dm_call_ice_v2','RTCPeerConnection','getUserMedia','createOffer','createAnswer','setRemoteDescription','addIceCandidate','switchCamera','toggleMute','finish']) assert.ok(js.includes(token), `missing ${token}`);
  assert.ok(js.includes("'voice','video'"));
  assert.ok(js.includes('startRingtone') && js.includes('stopRingtone'));
  assert.ok(js.includes('startHeartbeat') && js.includes('caller_heartbeat_at') && js.includes('callee_heartbeat_at'));
  assert.ok(js.includes('armConnectionTimeout'));
  assert.ok(js.includes('db.auth.onAuthStateChange'), 'boot must resume when auth becomes ready after the call module loads');
  assert.ok(js.includes('pollIncomingInbox') && js.includes('startInboxRecovery'), 'incoming calls need a database recovery path if Realtime misses an INSERT');
  assert.ok(js.includes('setTimeout(() => { bootPromise = null; void boot(); }, 1200)'), 'missing Supabase client must trigger a bounded initialization retry');
  assert.ok(js.includes('Answered on another device'));
  assert.ok(js.includes('!current.answerApplying') && js.includes('current.answerApplying = true'), 'duplicate Realtime/SELECT answer delivery must be serialized');
  assert.ok(js.includes('current.finishing'), 'call teardown must be idempotent');
  assert.ok(js.includes('if (current !== call) { next.getTracks().forEach(track => track.stop()); return; }'), 'camera permission completion after hangup must clean up its stream');
  assert.ok(!/sitewide-calls-v\d+|spike-dm-realtime-calls-v\d+/.test(js), 'legacy call runtime must not be imported');
});

test('all Supabase-enabled pages load the global incoming-call receiver', () => {
  const pages = fs.readdirSync(root).filter(name=>name.endsWith('.html'));
  const eligible = pages.filter(name=>{const html=read(name);return html.includes('@supabase/supabase-js')&&html.includes('js/supabase-singleton.js')});
  assert.ok(eligible.length >= 10);
  for (const name of eligible) {
    assert.ok(read(name).includes('js/spike-calling-v2.js'), `${name} missing global call receiver`);
    assert.ok(read(name).includes('css/spike-calling-v2.css'), `${name} missing global call overlay styles`);
  }
});

test('DM header gets dedicated voice and video controls without mixing with voice notes', () => {
  const html = read('message.html'), js = read('js/spike-calling-v2.js');
  assert.ok(html.includes('id="voiceNote"'));
  assert.ok(js.includes('spikeVoiceCallButton') && js.includes('spikeVideoCallButton'));
  assert.ok(js.includes("make('spikeVoiceCallButton','fa-phone'"));
  assert.ok(js.includes("make('spikeVideoCallButton','fa-video'"));
});

test('database migration has participant RLS, privacy guard, transition guard and Realtime publication', () => {
  const sql = read('supabase/migrations/20261118071649_spike_dm_calling_v2.sql');
  const privacy = read('supabase/migrations/20261118071739_spike_dm_calling_v2_privacy_guard.sql');
  const grants = read('supabase/migrations/20261118071831_spike_dm_calling_v2_exact_grants.sql');
  const privateGuard = read('supabase/migrations/20261118071934_spike_dm_calling_v2_private_guard_predicate_fix.sql');
  const payloadChecks = read('supabase/migrations/20261118071953_spike_dm_calling_v2_signaling_payload_validation.sql');
  const heartbeat = read('supabase/migrations/20261118072100_spike_dm_calling_v2_heartbeat_and_stale_release.sql');
  const perParticipant = read('supabase/migrations/20261118072414_spike_dm_calling_v2_per_participant_heartbeats.sql');
  for (const token of ['enable row level security','spike dm calls v2 participants read','spike dm calls v2 caller creates','spike dm calls v2 participants update','spike dm ice participants read','spike dm ice participant sends own candidates','spike_dm_calls_v2_guard_update','supabase_realtime']) assert.ok(sql.toLowerCase().includes(token.toLowerCase()), `migration missing ${token}`);
  assert.ok(privacy.includes('can_message_spike_user'));
  assert.ok(privacy.includes('pg_advisory_xact_lock'));
  assert.ok(grants.includes('revoke all on table public.spike_dm_call_ice_v2 from anon, public, authenticated'));
  assert.ok(privateGuard.includes('security definer') && privateGuard.includes('auth.uid()'));
  assert.ok(privateGuard.includes('where (c.caller_id in'));
  assert.ok(payloadChecks.includes('spike_dm_calls_v2_offer_shape'));
  assert.ok(heartbeat.includes('heartbeat_at'));
  assert.ok(heartbeat.includes("interval '90 seconds'"));
  assert.ok(perParticipant.includes('caller_heartbeat_at') && perParticipant.includes('callee_heartbeat_at'));
});

test('legacy direct-message calling stays removed; voice notes and Rooms pages remain', () => {
  const message = read('message.html'), rooms = read('js/spike-rooms-v1.js'), roomPage = read('room.html'), call = read('js/spike-calling-v2.js');
  assert.ok(message.includes('MediaRecorder'));
  assert.ok(message.includes("message_type:'voice'"));
  assert.ok(rooms.length > 0);
  assert.ok(roomPage.includes('spike-rooms-v1.js') || roomPage.includes('spike-room-page.js'));
  assert.ok(call.includes('spike_dm_calls_v2'));
  assert.ok(!fs.existsSync(path.join(root,'js/spike-dm-realtime-calls-v2.js')));
});
