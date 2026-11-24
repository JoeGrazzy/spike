import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const messaging = fs.readFileSync(new URL('../js/spike-messaging.js', import.meta.url), 'utf8');
const calls = fs.readFileSync(new URL('../js/spike-call-engine.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
const dmMigration = fs.readFileSync(new URL('../supabase/migrations/20261123234241_spike_realtime_private_topic_hardening_v1.sql', import.meta.url), 'utf8');

test('one-to-one conversation resolves the call recipient ID', () => {
  assert.match(messaging, /currentPeerId\s*=\s*!isGroup\s*&&\s*peerId\s*\?\s*String\(peerId\)\s*:\s*null/);
  assert.match(messaging, /getCallContext:\(\)=>\(\{conversationId,peerId:currentPeerId,isGroup:currentConversationIsGroup\}\)/);
});

test('group conversations do not expose a call recipient', () => {
  assert.match(messaging, /currentPeerId\s*=\s*!isGroup\s*&&\s*peerId/);
});

test('calls use local STUN configuration without a TURN credential fetch', () => {
  assert.match(calls, /stun:stun\.cloudflare\.com:3478/);
  assert.match(calls, /stun:stun\.l\.google\.com:19302/);
  assert.doesNotMatch(calls, /fetch\(\s*['"]\/api\/call-ice/);
  assert.doesNotMatch(calls, /TURN_KEY|turnAvailable/);
});

test('Worker no longer exposes a TURN credential endpoint', () => {
  assert.doesNotMatch(worker, /call-ice|TURN_KEY|generate-ice-servers/);
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

test('call event subscription uses a private per-user Realtime channel', () => {
  assert.match(calls, /spike-call-events-\$\{userId\}`,[\s]*\{config:\{private:true\}\}/);
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
